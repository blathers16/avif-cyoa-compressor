import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NgbProgressbar,
  NgbTooltip,
} from '@ng-bootstrap/ng-bootstrap';
import { reduce, tap } from 'rxjs';

import { DownloadData } from '../models/download-data';
import { OrderedString } from '../models/ordered-string';

import { isDataURLIncludingAvif } from '../utilities/regex';

import { formatSize } from '../utilities/utils';
import { ResultComponent } from "../result/result.component";
import { AboutComponent } from "../about/about.component";
import { CompressorService } from '../services/compressor.service';
@Component({
  selector: 'app-compressor',
  imports: [
    NgbTooltip,
    NgbProgressbar,
    ResultComponent,
    AboutComponent
],
  templateUrl: './compressor.component.html',
  styleUrl: './compressor.component.scss',
})
export class CompressorComponent {
  compressorService = inject(CompressorService);
  private destroyRef = inject(DestroyRef);

  // quality setting
  // passed as cq setting to libavif
  quality = signal(27);
  // progressbar current
  progress = signal(0);
  // progressbar max
  progressMax = signal(100);
  // show progressbar
  inProgress = signal(false);
  // display elapsed time
  elapsedTime = signal('');

  clearPicker = signal(true);

  result = signal<DownloadData | null>(null);


  setQuality(s: string): void {
    this.quality.set(Number(s));
  }

  // remove and re-add the file picker to the DOM
  // to allow selecting the same file again
  // if someone has a better idea, hit me up on github
  toggleClearPicker(): void {
    this.clearPicker.update((value) => !value);
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
    this.inProgress.set(false);
    // mark completion time
    const endTime: number = performance.now();

    // runtime in milliseconds with decimal
    const elapsedMS: number = endTime - startTime;

    this.elapsedTime.set(new Date(elapsedMS).toISOString().slice(11, -3));

    // and push to DOM
    this.result.set({
      href: URL.createObjectURL(outFile),
      download: outFile.name,
      innerText: outFile.name,
      inFileSize: formatSize(inFileSizeRaw.toString()),
      outFileSize: formatSize(outFile.size.toString()),
    });
  }

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
    if (this.result()?.href) {
      URL.revokeObjectURL(this.result()!.href);
    }

    this.result.set(null);

    const infile: File = infiles[0];
    this.progress.set(0);
    
    this.inProgress.set(true);
    console.log('setting in progress');
    this.compressorService.convert(infile, this.quality())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        tap((): void => this.progressMax.set(this.compressorService.getProgressMax())),
        // update progressbar
        // also update progress for AVIFs that were already in the CYOA
        tap((x: OrderedString) => {
          if (isDataURLIncludingAvif(x.s)) {
            this.progress.update((value) => value + 1);
          }
        }),
        // collect all the results together into one array
        reduce(
          (acc: OrderedString[], value: OrderedString): OrderedString[] => [
            ...acc,
            value,
          ],
          [] as OrderedString[]
        )
      )
      .subscribe(async (convertedFiles: OrderedString[]) => {
        // these arrive in whatever order they convert in, so we need to sort them
        convertedFiles.sort(this.sortResults);
        // remove the annotation used for sorting
        const withoutIndices: string[] = convertedFiles.map(
          (x: OrderedString) => x.s
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

