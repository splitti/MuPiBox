import { ComponentFixture, TestBed } from '@angular/core/testing'

import { HomePage } from './home.page'

describe('HomePage', () => {
  let component: HomePage
  let fixture: ComponentFixture<HomePage>

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HomePage],
    }).compileComponents()

    fixture = TestBed.createComponent(HomePage)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })

  // TODO: Test clear resume.
})
