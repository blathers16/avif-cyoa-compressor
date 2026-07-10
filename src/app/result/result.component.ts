import { Component, input } from '@angular/core';
import { DownloadData } from '../models/download-data';

@Component({
  selector: 'app-result',
  imports: [],
  templateUrl: './result.component.html',
  styleUrl: './result.component.scss',
})
export class ResultComponent {
  result = input<DownloadData|null>(null);
  elapsedTime = input<string>('');

  
  stripLeadingZeros(s: string): string {
    return parseInt(s).toString();
  }
}
