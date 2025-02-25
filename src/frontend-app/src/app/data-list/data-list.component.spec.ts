import { ComponentFixture, TestBed } from '@angular/core/testing'

import { DataListComponent } from './data-list.component'

describe('DataListComponent', () => {
  let component: DataListComponent
  let fixture: ComponentFixture<DataListComponent>

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DataListComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(DataListComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
