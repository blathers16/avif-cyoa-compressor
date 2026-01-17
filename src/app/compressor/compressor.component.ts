import { Component } from '@angular/core';
import { fromWorkerPool } from 'observable-webworker';
import {
  NgbAccordionBody,
  NgbAccordionButton,
  NgbAccordionCollapse,
  NgbAccordionDirective,
  NgbAccordionHeader,
  NgbAccordionItem,
  NgbProgressbar,
  NgbTooltip,
} from '@ng-bootstrap/ng-bootstrap';
import { Observable, concatAll, from, map, mergeAll, reduce, tap } from 'rxjs';

import { DownloadData } from '../models/download-data';
import { OrderedString } from '../models/ordered-string';

import {
  isDataURLIncludingAvif,
  isImageURL,
  DATAURLINCLUDINGAVIF,
  IMAGEURL,
  isJSONFileName,
  ANYDATAURL,
  isANYDATAURL,
} from '../utilities/regex';

import { formatSize } from '../utilities/utils';
@Component({
  selector: 'app-compressor',
  standalone: true,
  imports: [
    NgbAccordionDirective,
    NgbAccordionItem,
    NgbAccordionHeader,
    NgbAccordionButton,
    NgbAccordionCollapse,
    NgbAccordionBody,
    NgbTooltip,
    NgbProgressbar,
  ],
  templateUrl: './compressor.component.html',
  styleUrl: './compressor.component.scss',
})
export class CompressorComponent {
  // quality setting
  // passed as cq setting to libavif
  quality: number = 33;
  // progressbar current
  progress: number = 0;
  // progressbar max
  progressMax: number = 100;
  // show progressbar
  inProgress: boolean = false;
  // display elapsed time
  elapsedTime: string = '';

  clearPicker: boolean = true;

  // dispatcher for web workers using observable-webworker
  // https://github.com/cloudnc/observable-webworker
  convertText(s: any[]): Observable<OrderedString[]> {
    return fromWorkerPool<OrderedString, OrderedString[]>(
      () =>
        new Worker(new URL('./compressor.worker', import.meta.url), {
          type: 'module',
        }),
      s,
    );
  }

  stripLeadingZeros(s: string): string {
    return parseInt(s).toString();
  }

  setQuality(s: string): void {
    const n = Number(s);
    this.quality = n;
  }

  // remove and re-add the file picker to the DOM
  // to allow selecting the same file again
  // if someone has a better idea, hit me up on github
  toggleClearPicker() {
    this.clearPicker = !this.clearPicker;
  }

  // main function to setup conversion
  // takes a File object as input
  // todo: figure out typing for return type
  convert(file: File): any {
    // turn our file into a string
    return from(file.text()).pipe(
      // show progressbar
      tap((x) => (this.inProgress = true)),
      // split the string into an array of strings
      // that are the dataURLs and the stuff before and after them
      map((x: string): string[] => x.split(ANYDATAURL)),
      // store length of array for progressbar
      // only include dataURLs
      // slight inaccuracies due to being
      // we need to count AVIFs going in
      // because we won't be able to tell
      // if ones coming out have been converted
      // by us or were already in AVIF format
      tap(
        (x: string[]) =>
          (this.progressMax =
            x.filter((x) => isDataURLIncludingAvif(x)).length > 0
              ? x.filter((x) => isDataURLIncludingAvif(x)).length
              : 100)
      ),
      // annotate our strings with their index in the array so we
      // can put them back together in the right order later
      map((x) =>
        x.map((st: string, i: number): OrderedString => {
          return { s: st, index: i, quality: this.quality };
        }),
      ),
      // send the strings off to the dispatch function
      // data urls will be converted, and others will be returned
      // as-is
      map(
        (x: OrderedString[]): Observable<OrderedString[]> =>
          this.convertText(x),
      ),
      mergeAll()
    );
  }

  sortResults(a: OrderedString, b: OrderedString): number {
    if (a.index < b.index) {
      return -1;
    } else if (a.index > b.index) {
      return 1;
    } else {
      return 0;
    }
  }

  async displayFile(
    outFile: File,
    inFileSizeRaw: number,
    startTime: number,
  ): Promise<void> {
    // hide progressbar
    this.inProgress = false;
    // mark completion time
    const endTime: number = performance.now();

    // runtime in milliseconds with decimal
    const elapsedMS: number = endTime - startTime;

    this.elapsedTime = new Date(elapsedMS).toISOString().slice(11, -3);

    // and push to DOM
    this.result = {
      href: URL.createObjectURL(outFile),
      download: outFile.name,
      innerText: outFile.name,
      inFileSize: formatSize(inFileSizeRaw.toString()),
      outFileSize: formatSize(outFile.size.toString()),
    };
  }

  result: DownloadData | null = null;

  async process(e: Event | null): Promise<void> {
    if (!e) return;
    const target = e.target as HTMLInputElement;
    let infiles = target.files;
    // incase you canceled the file select, you won't lose your
    // previous result
    if (!infiles) return;

    const startTime: number = performance.now();

    // revoke any references to previously compressed
    // CYOAs to free memory
    if (this.result?.href) {
      URL.revokeObjectURL(this.result.href);
    }

    this.result = null;

    const infile: File = infiles[0];
    this.progress = 0;

    await this.convert(infile)
      .pipe(
        // update progressbar
        // also update progress for AVIFs that were already in the CYOA
        tap((x: OrderedString) =>
          isDataURLIncludingAvif(x.s) ? this.progress++ : null,
        ),
        // collect all the results together into one array
        reduce(
          (acc: OrderedString[], value: OrderedString): OrderedString[] => [
            ...acc,
            value,
          ],
          [] as OrderedString[],
        ),
      )
      .subscribe(async (convertedFiles: OrderedString[]) => {
        // these arrive in whatever order they convert in, so we need to sort them
        convertedFiles.sort(this.sortResults);
        // remove the annotation used for sorting
        const withoutIndices: string[] = convertedFiles.map(
          (x: OrderedString) => x.s,
        );
        // join to a single string
        const fileString: string = withoutIndices.join('');
        // convert to a blob
        const blob = new Blob([fileString], { type: infile.type });
        // and create a file
        const outfile = new File([blob], infile.name, { type: infile.type });
        // and push to DOM
        await this.displayFile(outfile, infile.size, startTime);
      });
  }
}
