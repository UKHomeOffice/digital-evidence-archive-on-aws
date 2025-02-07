/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

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
  onProgressFn: (payload: any) => void;
  onErrorFn: (payload: any) => void;
  onCompleteFn: (payload: UploaderCompleteEvent) => void;
}

export class MyUploader {
  private parts: UploaderFilePart[];
  private readonly chunkSize: number;
  private readonly threadsQuantity: number;
  private readonly timeout: number;
  private readonly activeConnections: { [k: number]: XMLHttpRequest };
  private readonly file: File;
  private aborted: boolean;

  private readonly onProgressFn: (payload: any) => void;
  private readonly onErrorFn: (payload: any) => void;
  private readonly onCompleteFn: (payload: UploaderCompleteEvent) => void;

  private uploadedSize: number;
  private readonly progressCache: any;
  private readonly uploadedParts: Array<UploaderUploadedPart>;
  private readonly uploadId: string;
  private readonly fileKey: string;

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
    this.onProgressFn = options.onProgressFn;
    this.onErrorFn = options.onErrorFn;
    this.onCompleteFn = options.onCompleteFn;
  }

  async start() {
    const startTime = performance.now();
    try {
      await this.uploadLargeFile();
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

  convertSecondsToMinutes(seconds: number): string {
    const minutes = Math.floor(seconds / 60); // Get whole minutes
    const remainingSeconds = Math.floor(seconds % 60); // Get remaining seconds

    // Format the output as "minutes:seconds"
    return `${minutes}m ${remainingSeconds}s`;
  }

  async uploadLargeFile() {
    // Wait for all parts to upload
    const totalParts = Math.ceil(this.file.size / this.chunkSize);

    // Step 2: Upload each part
    const uploadPromises = [];

    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const part = this.parts[partNumber - 1];
      uploadPromises.push(this.uploadPart(this.file, partNumber, part));
    }

    // Wait for all parts to upload
    try {
      await Promise.all(uploadPromises);
      void this.complete();
    } catch (error) {
      console.error('Error uploading file parts:', error);
    }
  }

  uploadPart(file: Blob, partNumber: number, part: UploaderFilePart): Promise<void> {
    console.log('Upload : Start...');

    // uploading each part with its pre-signed URL
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', part.signedUrl, true);
      xhr.setRequestHeader('Content-Type', file.type);

      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve();
        } else {
          reject(new Error(`Failed to upload part ${part.PartNumber}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => reject(new Error(`Network error during part ${part.PartNumber} upload`));

      xhr.ontimeout = (error) => {
        console.log('XHR Timedout.....', error, ':', part);
        reject(new Error(`Timedout during part ${part.PartNumber} upload`));
      };
      xhr.onabort = () => {
        reject(new Error(`User cancelled operation during part ${part.PartNumber} upload`));
      };

      const progressListener = this.handleProgress.bind(this, part.PartNumber - 1);
      xhr.upload.addEventListener('progress', progressListener);
      xhr.addEventListener('error', progressListener);
      xhr.addEventListener('abort', progressListener);
      xhr.addEventListener('loadend', progressListener);

      const abortXHR = () => xhr.abort();
      window.addEventListener('offline', abortXHR);

      // Calculate the byte range for the part
      const startByte = (partNumber - 1) * this.chunkSize;
      const endByte = Math.min(startByte + this.chunkSize, file.size);

      const partBlob = file.slice(startByte, endByte);
      try {
        xhr.send(partBlob);
      } catch (error) {
        this.onErrorFn(error);
      }
    });
  }

  handleProgress(part: number, event: any) {
    if (this.file) {
      if (event.type === 'progress' || event.type === 'error' || event.type === 'abort') {
        this.progressCache[part] = event.loaded;
      }

      if (event.type === 'uploaded') {
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
        // sent: sent,
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
