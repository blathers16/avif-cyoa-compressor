import { Service } from '@angular/core';
import { from, map, mergeAll, mergeMap, Observable, tap } from 'rxjs';
import { ANYDATAURL, isDataURLIncludingAvif } from '../utilities/regex';
import { OrderedString } from '../models/ordered-string';
import { fromWorkerPool } from 'observable-webworker';




@Service()
export class CompressorService {
  progressMax: number = 0;

      // dispatcher for web workers using observable-webworker
  // https://github.com/cloudnc/observable-webworker
  convertText(s: any[]): Observable<OrderedString> {
    return fromWorkerPool<OrderedString, OrderedString>(
      () =>
        new Worker(new URL('../workers/compressor.worker', import.meta.url), {
          type: 'module',
        }),
      s,
    );
  }


    // main function to setup conversion
    // takes a File object as input
    // todo: figure out typing for return type
    convert(file: File, quality: number): Observable<OrderedString> {
      console.log('conversion started');
      // turn our file into a string
      return from(file.text()).pipe(
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
        tap((items: string[]) => {
          const avifCount = items.filter((item) =>
            isDataURLIncludingAvif(item),
          ).length;
          this.progressMax = (avifCount > 0 ? avifCount : 100);
        }),
        // annotate our strings with their index in the array so we
        // can put them back together in the right order later
        map((x) =>
          x.map((st: string, i: number): OrderedString => {
            return { s: st, index: i, quality: quality };
          }),
        ),
        // // send the strings off to the dispatch function
        // // data urls will be converted, and others will be returned
        // // as-is
        // map(
        //   (x: OrderedString[]): Observable<OrderedString[]> =>
        //     this.convertText(x),
        // ),
        // mergeAll(),
        mergeMap(
      (items: OrderedString[]): Observable<OrderedString> =>
        this.convertText(items),
    ),
      );
    }

    getProgressMax(): number {
      return this.progressMax;
    }
}
