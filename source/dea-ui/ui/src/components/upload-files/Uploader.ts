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

// original source: https://github.com/pilovm/multithreaded-uploader/blob/master/frontend/uploader.js
export class Uploader {
  private parts: UploaderFilePart[];
  private readonly chunkSize: number;
  private readonly threadsQuantity: number;
  private readonly timeout: number;
  private readonly activeConnections: any;
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
    try {
      this.sendNext();
    } catch (error: any) {
      await this.complete(error);
    }
  }

  sendNext(retry = 0) {
    const activeConnections = Object.keys(this.activeConnections).length;

    if (activeConnections >= this.threadsQuantity) {
      return;
    }

    if (!this.parts.length) {
      if (!activeConnections) {
        void this.complete();
      }

      return;
    }

    const part = this.parts.pop();
    if (this.file && part) {
      const sentSize = (part.PartNumber - 1) * this.chunkSize;
      const chunk = this.file.slice(sentSize, sentSize + this.chunkSize);

      const sendChunkStarted = () => {
        this.sendNext();
      };

      this.sendChunk(chunk, part, sendChunkStarted)
        .then(() => {
          this.sendNext();
        })
        .catch((error) => {
          if (retry <= 6) {
            retry++;
            const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
            //exponential backoff retry before giving up
            console.log(
              `Part#${part.PartNumber} failed to upload, backing off ${2 ** retry * 100} before retrying...`
            );
            void wait(2 ** retry * 100).then(() => {
              this.parts.push(part);
              this.sendNext(retry);
            });
          } else {
            console.log(`Part#${part.PartNumber} failed to upload, giving up`);
            void this.complete(error);
          }
        });
    }
  }

  async complete(error?: any) {
    if (error && !this.aborted) {
      this.onErrorFn(error);
      return;
    }

    if (error) {
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

  sendChunk(chunk: Blob, part: UploaderFilePart, sendChunkStarted: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      this.upload(chunk, part, sendChunkStarted)
        .then((status) => {
          if (status !== 200) {
            reject(new Error('Failed chunk upload'));
            return;
          }

          resolve();
        })
        .catch((error) => {
          reject(error);
        });
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
        sent: sent,
        total: total,
        percentage: percentage,
      });
    }
  }

  upload(file: Blob, part: UploaderFilePart, sendChunkStarted: () => void) {
    // uploading each part with its pre-signed URL
    return new Promise((resolve, reject) => {
      const throwXHRError = (error: any, part: UploaderFilePart, abortFx?: any) => {
        delete this.activeConnections[part.PartNumber - 1];
        reject(error);
        window.removeEventListener('offline', abortFx);
      };
      if (this.uploadId && this.fileKey) {
        if (!window.navigator.onLine) {
          reject(new Error('System is offline'));
        }

        const xhr = (this.activeConnections[part.PartNumber - 1] = new XMLHttpRequest());
        xhr.timeout = this.timeout;
        sendChunkStarted();

        const progressListener = this.handleProgress.bind(this, part.PartNumber - 1);

        xhr.upload.addEventListener('progress', progressListener);

        xhr.addEventListener('error', progressListener);
        xhr.addEventListener('abort', progressListener);
        xhr.addEventListener('loadend', progressListener);

        xhr.open('PUT', part.signedUrl);
        const abortXHR = () => xhr.abort();
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4 && xhr.status === 200) {
            const ETag = xhr.getResponseHeader('ETag');

            if (ETag) {
              const uploadedPart = {
                PartNumber: part.PartNumber,
                ETag: ETag.replaceAll('"', ''),
              };

              this.uploadedParts.push(uploadedPart);

              resolve(xhr.status);
              delete this.activeConnections[part.PartNumber - 1];
              window.removeEventListener('offline', abortXHR);
            }
          }
        };

        xhr.onerror = (error) => {
          throwXHRError(error, part, abortXHR);
        };
        xhr.ontimeout = (error) => {
          throwXHRError(error, part, abortXHR);
        };
        xhr.onabort = () => {
          throwXHRError(new Error('Upload canceled by user or system'), part);
        };
        window.addEventListener('offline', abortXHR);
        xhr.send(file);
      }
    });
  }

  abort() {
    Object.keys(this.activeConnections)
      .map(Number)
      .forEach((id) => {
        this.activeConnections[id].abort();
      });

    this.aborted = true;
  }
}
