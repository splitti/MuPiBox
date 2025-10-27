import { ComponentFixture, TestBed } from '@angular/core/testing'

import { AddEditPage } from './add-edit.page'

describe('AddEditPage', () => {
  let component: AddEditPage
  let fixture: ComponentFixture<AddEditPage>

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AddEditPage],
    }).compileComponents()

    fixture = TestBed.createComponent(AddEditPage)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
