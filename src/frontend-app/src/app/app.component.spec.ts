import { ComponentFixture, TestBed } from '@angular/core/testing'

import { AppComponent } from './app.component'
import { provideExperimentalZonelessChangeDetection } from '@angular/core'

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, provideExperimentalZonelessChangeDetection()],
    }).compileComponents()
    const fixture = TestBed.createComponent(AppComponent)
    await fixture.whenStable()
  })

  it('should create the app', () => {
    const app = fixture.componentInstance
    expect(app).toBeTruthy()
  })
})
