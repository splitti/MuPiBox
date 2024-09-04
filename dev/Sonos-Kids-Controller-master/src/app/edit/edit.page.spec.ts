import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { EditPage } from './edit.page';
import { HttpClientModule } from '@angular/common/http';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing"


describe('EditPage', () => {
  let component: EditPage;
  let fixture: ComponentFixture<EditPage>;
  let httpClient: HttpTestingController;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ EditPage ],
      imports: [IonicModule.forRoot(), HttpClientModule, RouterTestingModule, HttpClientTestingModule]
    }).compileComponents();

    httpClient = TestBed.inject(HttpTestingController)

    fixture = TestBed.createComponent(EditPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    httpClient.expectOne("http://localhost:8200/api/sonos")
    expect(component).toBeTruthy();
  });
});
