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
  reduce
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
  DATAURL = RegExp(
    '(["\'`]data:image/(?:j?pe?n?g|webp);base64,[a-zA-Z0-9+/]+={0,2}["\'`])'
  ); // parens for split()
  isDataURL = (s: string) =>
    s.match(
      '^(["\'`]data:image/(?:j?pe?n?g|webp);base64,[a-zA-Z0-9+/]+={0,2}["\'`])$'
    ) && s[0] == s.slice(-1);
  fileSizesSum = (files: File[]) =>
    Array.from(files)
      .map((x) => x.size)
      .reduce((n, m) => n + m, 0);
  _num = (n: string) => {
    const match = `${n}`.match(/(\d+?)(?=(\d{3})+(?!\d)|$)/g);
    return (match ? match : ['']).join(' ');
  };
  $node = (tag: any, options = {}) =>
    Object.assign(document.createElement(tag), options);
  params = () => ['image/webp', `${this.quality}/100`];

  convertText(s: any[]): Observable<orderedString[]> {
    return fromWorkerPool<orderedString, orderedString[]>(
      () =>
        new Worker(new URL('./compressor.worker', import.meta.url), {
          type: 'module',
        }),
      s
    );
  }

  counter: number = 0;

  convert(file: File): any {
    return from(file.text()).pipe(
      map((x) => x.split(this.DATAURL)),
      map((x) => x.map((st: string , i: number): orderedString => {return { s: st, index: i}})),
      map((x) => this.convertText(x)),
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
    if (!infiles) return;
    this.results.forEach((result: DownloadData) =>
      URL.revokeObjectURL(result.href)
    );
    this.results = [];

    const infile: File = infiles[0];

    await this.convert(infile)
      .pipe(
        reduce((acc: orderedString[], curr: orderedString) => [...acc, curr], [] as orderedString[])
      )
      .subscribe((convertedFiles: any) => {
        convertedFiles.sort(this.sortResults)
        const withoutIndices: string[] = convertedFiles.map((x: orderedString) => x.s)
        const fileString: string = withoutIndices.join('')
        const blob = new Blob([fileString], { type: infile.type });

        const outfile = new File([blob], infile.name, { type: infile.type });
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
