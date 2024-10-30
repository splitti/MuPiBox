import { ComponentFixture, TestBed } from '@angular/core/testing'

import { LoadingComponent } from './loading.component'

describe('LoadingComponent', () => {
  let component: LoadingComponent
  let fixture: ComponentFixture<LoadingComponent>

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LoadingComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(LoadingComponent)
    component = fixture.componentInstance
    fixture.componentRef.setInput('loading', false)
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })

  it('should not show blocking div if loading=false', () => {
    fixture.componentRef.setInput('loading', false)
    fixture.detectChanges()
    expect(fixture.debugElement.nativeElement.querySelector('.mupi-loading')).toBeNull()
  })

  it('should show blocking div if loading=true', () => {
    fixture.componentRef.setInput('loading', true)
    fixture.detectChanges()
    expect(fixture.debugElement.nativeElement.querySelector('.mupi-loading')).not.toBeNull()
  })
})
