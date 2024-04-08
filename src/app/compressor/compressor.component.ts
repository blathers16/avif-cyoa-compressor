import { Component } from '@angular/core';
import { fromWorkerPool } from 'observable-webworker';
import {
  NgbAccordionBody,
  NgbAccordionButton,
  NgbAccordionCollapse,
  NgbAccordionDirective,
  NgbAccordionHeader,
  NgbAccordionItem,
} from '@ng-bootstrap/ng-bootstrap';
import {
  Observable,
  concatAll,
  from,
  map,
  reduce,
  tap
} from 'rxjs';

interface DownloadData {
  href: string;
  download: string;
  innerText: string;
  inFileSize: string;
  outFileSize: string;
}

interface orderedString {
  s: string;
  index: number;
}

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
  ],
  templateUrl: './compressor.component.html',
  styleUrl: './compressor.component.scss',
})
export class CompressorComponent {
  quality: number = 75;
  progressText: string = '';

  MIME = RegExp('image/([a-z]+)');
  // regex for finding data image dataURLs
  // currently setup to find jpeg, jpg, png, webp, and gif
  DATAURL = RegExp(
    '(["\'`]data:image/(?:j?pe?n?g|webp|gif);base64,[a-zA-Z0-9+/]+={0,2}["\'`])'
  ); // parens for split()
  // formatter for file sizes
  _num = (n: string) => {
    const match = `${n}`.match(/(\d+?)(?=(\d{3})+(?!\d)|$)/g);
    return `${(match ? match : ['']).join(',')} Bytes`;
  };

  // dispatcher for web workers using observable-webworker
  // https://github.com/cloudnc/observable-webworker
  convertText(s: any[]): Observable<orderedString[]> {
    return fromWorkerPool<orderedString, orderedString[]>(
      () =>
        new Worker(new URL('./compressor.worker', import.meta.url), {
          type: 'module',
        }),
      s
    );
  }


  // main function to setup conversion
  // takes a File object as input
  // todo: figure out typing for return type
  convert(file: File): any {
    // turn our file into a string
    return from(file.text()).pipe(
      // split the string into an array of strings
      // that are the dataURLs and the stuff before and after them
      map((x: string): string[] => x.split(this.DATAURL)),
      // annotate our strings with their index in the array so we
      // can put them back together in the right order later
      map((x) => x.map((st: string , i: number): orderedString => {return { s: st, index: i}})),
      // send the strings off to the dispatch function
      // data urls will be converted, and others will be returned
      // as-is
      map((x: orderedString[]): Observable<orderedString[]> => this.convertText(x)),
      concatAll()
    );
  }

sortResults(a: orderedString, b: orderedString): number{
  if (a.index < b.index) {
    return -1;
  } else if (a.index > b.index) {
    return 1;
  } else {
    return 0;
  }
}

  results: DownloadData[] = [];

  async process(e: Event): Promise<void> {
    const target = e.target as HTMLInputElement;
    let infiles = target.files;
    // incase you canceled the file select, you won't lose your
    // previous result
    if (!infiles) return;
    this.results.forEach((result: DownloadData) =>
      // revoke any references to previously compressed
      // CYOAs to free memory
      URL.revokeObjectURL(result.href)
    );
    this.results = [];

    const infile: File = infiles[0];

    await this.convert(infile)
      .pipe(
        // collect all the results together into one array
        reduce((acc: orderedString[], value: orderedString): orderedString[] => [...acc, value], [] as orderedString[])
      )
      .subscribe((convertedFiles: orderedString[]) => {
        // these arrive in whatever order they convert in, so we need to sort them
        convertedFiles.sort(this.sortResults)
        // remove the annotation used for sorting
        const withoutIndices: string[] = convertedFiles.map((x: orderedString) => x.s)
        // join to a single string
        const fileString: string = withoutIndices.join('')
        // convert to a blob
        const blob = new Blob([fileString], { type: infile.type });
        // and create a file
        const outfile = new File([blob], infile.name, { type: infile.type });
        // and push to DOM
        this.results.push({
          href: URL.createObjectURL(outfile),
          download: outfile.name,
          innerText: outfile.name,
          inFileSize: this._num(infile.size.toString()),
          outFileSize: this._num(outfile.size.toString()),
        });
      });
  }
}
