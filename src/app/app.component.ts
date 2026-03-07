import { Component } from '@angular/core';
import { HeaderComponent } from './header/header.component';
import { FooterComponent } from './footer/footer.component';
import { CompressorComponent } from './compressor/compressor.component';

@Component({
    selector: 'app-root',
    imports: [
        HeaderComponent,
        FooterComponent,
        CompressorComponent,
    ],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'avif-cyoa-compressor';
}
