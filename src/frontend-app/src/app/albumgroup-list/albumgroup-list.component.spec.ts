import { ComponentFixture, TestBed } from '@angular/core/testing'

import { AlbumGroupListComponent } from './albumgroup-list.component'

describe('AlbumGroupListComponent', () => {
  let component: AlbumGroupListComponent
  let fixture: ComponentFixture<AlbumGroupListComponent>

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AlbumGroupListComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(AlbumGroupListComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
