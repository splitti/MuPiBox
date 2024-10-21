import { ComponentFixture, TestBed } from '@angular/core/testing'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'

import { ActivatedRoute } from '@angular/router'
import { AddPage } from './add.page'
import { FormsModule } from '@angular/forms'

describe('AddPage', () => {
  let component: AddPage
  let fixture: ComponentFixture<AddPage>
  let httpClient: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FormsModule, AddPage],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: {} },
      ],
    }).compileComponents()

    httpClient = TestBed.inject(HttpTestingController)

    fixture = TestBed.createComponent(AddPage)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    httpClient.expectOne('http://localhost:8200/api/sonos')
    expect(component).toBeTruthy()
  })
})
