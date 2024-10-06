import { AppComponent } from './app.component'
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'

describe('AppComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [AppComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    providers: [],
}).compileComponents()
  })

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent)
    const app = fixture.debugElement.componentInstance
    expect(app).toBeTruthy()
  })
})
