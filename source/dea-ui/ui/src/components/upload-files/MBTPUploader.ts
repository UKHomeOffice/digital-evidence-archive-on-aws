/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { InitiateCaseFileUploadDTO } from '@aws/dea-app/lib/models/case-file';
import axios, { AxiosProgressEvent } from 'axios';
import { initiateUpload } from '../../api/cases';
import { refreshCredentials } from '../../helpers/authService';

export interface UploaderUploadedPart {
  PartNumber: number;
  ETag: string;
}

export interface UploaderFilePart {
  signedUrl: string;
  PartNumber: number;
}

export interface UploaderCompleteEvent {
  uploadId: string;
  fileKey: string;
  parts: Array<UploaderUploadedPart>;
}

export interface UploaderOptions {
  parts: UploaderFilePart[];
  file: File;
  uploadId: string;
  fileKey: string;
  chunkSize: number;
  threads?: number;
  timeout?: number;
  uploadDto: InitiateCaseFileUploadDTO;
  onProgressFn: (payload: any) => void;
  onErrorFn: (payload: any) => void;
  onCompleteFn: (payload: UploaderCompleteEvent) => void;
}

const MAX_RETRIES = 5;

export class MyUploader {
  private parts: UploaderFilePart[];
  private readonly chunkSize: number;
  private readonly threadsQuantity: number;
  private readonly timeout: number;
  private readonly activeConnections: { [k: number]: XMLHttpRequest };
  private readonly file: File;
  private aborted: boolean;

  private readonly uploadDto: InitiateCaseFileUploadDTO;
  private readonly onProgressFn: (payload: any) => void;
  private readonly onErrorFn: (payload: any) => void;
  private readonly onCompleteFn: (payload: UploaderCompleteEvent) => void;

  private uploadedSize: number;
  private readonly progressCache: any;
  private readonly uploadedParts: Array<UploaderUploadedPart>;
  private readonly uploadId: string;
  private readonly fileKey: string;

  private totalUploaded = 0; // Track the total uploaded size

  // original source: https://github.com/pilovm/multithreaded-uploader/blob/master/frontend/uploader.js
  constructor(options: UploaderOptions) {
    // this must be bigger than or equal to 5MB,
    // otherwise AWS will respond with:
    // "Your proposed upload is smaller than the minimum allowed size"
    this.chunkSize = options.chunkSize;
    // number of parallel uploads
    this.threadsQuantity = Math.min(options.threads || 5, 15);

    // adjust the timeout value to activate exponential backoff retry strategy
    this.timeout = options.timeout || 0;
    this.file = options.file;
    this.aborted = false;
    this.uploadedSize = 0;
    this.progressCache = {};
    this.activeConnections = {};
    this.parts = options.parts;
    this.uploadedParts = [];
    this.uploadId = options.uploadId;
    this.fileKey = options.fileKey;
    this.uploadDto = options.uploadDto;
    this.onProgressFn = options.onProgressFn;
    this.onErrorFn = options.onErrorFn;
    this.onCompleteFn = options.onCompleteFn;
  }

  async start() {
    const startTime = performance.now();
    try {
      // await this.uploadLargeFile();
      await this.uploadMultiPartFile();
      const endTime = performance.now(); // Record end time in milliseconds
      const timeTaken = (endTime - startTime) / 1000; // Time in seconds
      const totalTimeInMinsSecs = this.convertSecondsToMinutes(timeTaken);

      console.log(`File ${this.file.name} uploaded successfully in ${totalTimeInMinsSecs}.`);
    } catch (error: any) {
      const endTime = performance.now(); // Capture time if upload fails
      const timeTaken = (endTime - startTime) / 1000;
      const totalTimeInMinsSecs = this.convertSecondsToMinutes(timeTaken);
      console.error(`Upload failed after ${totalTimeInMinsSecs} when uploading ${this.file.name}.`);

      await this.complete(error);
    }
  }

  async uploadMultiPartFile(): Promise<void> {
    const totalParts = Math.ceil(this.file.size / this.chunkSize);

    const partPromises: Promise<void>[] = [];

    this.totalUploaded = 0;

    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const presignedUrl = this.parts[partNumber - 1].signedUrl;
      const startByte = (partNumber - 1) * this.chunkSize;
      const endByte = Math.min(partNumber * this.chunkSize, this.file.size);
      const partBlob = this.file.slice(startByte, endByte); // Get the file part ot upload

      const partUploadPromise = this.uploadPartToSignedUrlWithRetry(presignedUrl, partBlob, partNumber);
      partPromises.push(partUploadPromise);

      // Limit the number of concurrent uploads
      if (partPromises.length >= this.threadsQuantity) {
        await Promise.all(partPromises); // Wait for these uploads to finish
        partPromises.length = 0; // Reset the queue
      }
    }

    await Promise.all(partPromises);
    await this.complete();
  }

  async uploadPartToSignedUrlWithRetry(signedUrl: string, partBlob: Blob, partNumber: number): Promise<void> {
    let attempts = 0;
    let partUploaded = false;

    while (attempts < MAX_RETRIES && !partUploaded) {
      try {
        await this.uploadPartToSignedUrl(signedUrl, partBlob, partNumber);
        console.log(`Part ${partNumber} uploaded successfully.`);

        partUploaded = true; // Success, move to the next part
      } catch (error) {
        console.error(
          `Error uploading part ${partNumber}. Attempt ${attempts + 1} of ${MAX_RETRIES}. Error: ${error}`
        );
        attempts++;

        if (attempts === MAX_RETRIES) {
          console.error(`Failed to upload part ${partNumber} after ${MAX_RETRIES} retries. Aborting.`);
          throw new Error(`Failed to upload part ${partNumber}`);
        } else {
          const oldURL = signedUrl;
          this.handleRetry(attempts, partNumber, signedUrl)
            .then((newURL) => {
              console.log(
                `Fetching new URL to reupload part: ${oldURL != newURL ? '\u{2705}' : '`\u{274C}'}`,
                partNumber
              );
              signedUrl = newURL;
            })
            .catch((error) => {
              console.log(error);
            });
        }
      }
    }
  }

  async uploadPartToSignedUrl(signedUrl: string, partBlob: Blob, partNumber: number): Promise<void> {
    try {
      const config = {
        headers: {
          'Content-Type': this.file.type, // Set the content type
        },
        onUploadProgress: (progressEvent: AxiosProgressEvent) => {
          if (progressEvent.upload) {
            this.handleProgress(partNumber, progressEvent);
          }
        },
      };

      // Perform the upload to the signed URL using Axios (correct argument order)
      await axios.put(signedUrl, partBlob, config);
    } catch (error) {
      console.error(`Error uploading part ${partNumber} to signed URL:`, error);
      throw error; // Rethrow to handle failure in main function
    }
  }

  convertSecondsToMinutes(seconds: number): string {
    const minutes = Math.floor(seconds / 60); // Get whole minutes
    const remainingSeconds = Math.floor(seconds % 60); // Get remaining seconds

    // Format the output as "minutes:seconds"
    return `${minutes}m ${remainingSeconds}s`;
  }

  async handleRetry(attempts: number, partNumber: number, presignedUrl: string): Promise<string> {
    // debugger;
    console.log(`\u{23F3} Retrying attempt ${attempts} for part ${partNumber} in 1000ms...`);
    new Promise((resolve) => setTimeout(resolve, 1000)).catch((error) => {
      // Handle error
      console.error('Error in setting timeout for retry:', error);
    });

    await refreshCredentials();

    // Regenerate URL before retrying
    // const oldUrl = presignedUrl;
    presignedUrl = await this.generatePresignedUrl(partNumber);
    // console.log(`\u{1F50D}  URL Changed? ${oldUrl !== presignedUrl ? "\u{2705} Yes" : "\u{274C} No"}`);
    return presignedUrl;
  }

  async generatePresignedUrl(partNumber: number): Promise<string> {
    const newUploadDto = { ...this.uploadDto };
    newUploadDto.partRangeStart = partNumber;
    newUploadDto.partRangeEnd = partNumber;

    const initiatedCaseFile = await initiateUpload(newUploadDto);
    return initiatedCaseFile.presignedUrls[0];
  }

  handleProgress(part: number, event: any) {
    // if(Object.entries(this.progressCache).length > 20){
    //   // console.log(Object.entries(this.progressCache).slice(-10).map(([key, value]) => `${key} : ${value}`).join(' | '));
    // console.log(Object.entries(this.progressCache).filter(([,value])=> (value != 367001600)).map(([key, value]) => `${key} : ${value}`).join(' | '));
    // }else{
    // console.log(this.progressCache);
    // }

    if (this.file) {
      const eventObj = event.event;

      if (eventObj.type === 'error') {
        console.log('Error detected...', part, '-', event);
      }
      if (eventObj.type === 'progress' || event.type === 'error' || event.type === 'abort') {
        this.progressCache[part] = event.loaded;
      }

      if (eventObj.type === 'uploaded') {
        this.uploadedSize += this.progressCache[part] || 0;
        delete this.progressCache[part];
      }

      const inProgress = Object.keys(this.progressCache)
        .map(Number)
        .reduce((memo, id) => (memo += this.progressCache[id]), 0);

      const sent = Math.min(this.uploadedSize + inProgress, this.file.size);
      const total = this.file.size;
      const percentage = Math.round((sent / total) * 100);

      this.onProgressFn({
        fileName: this.file.name,
        part: part,
        total: total,
        percentage: percentage,
      });
    }
  }

  async complete(error?: any) {
    if (error && !this.aborted) {
      console.log('Completing Error and not aborted...');
      this.onErrorFn(error);
      return;
    }
    if (error) {
      console.log('Completing Error...');
      this.onErrorFn(error);
      return;
    }

    try {
      this.onCompleteFn({
        uploadId: this.uploadId,
        fileKey: this.fileKey,
        parts: this.uploadedParts,
      });
    } catch (error) {
      this.onErrorFn(error);
    }
  }
}
