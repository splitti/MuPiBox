import { Injectable } from "@angular/core";
import { Resolve } from "@angular/router";
import { MediaService } from "./media.service";

@Injectable()

export class RouteResolver implements Resolve<any> {

    constructor(
        private mediaService: MediaService
    ) {}

    resolve() {
        console.log(this.mediaService.getNetworkObservable());
        return this.mediaService.getNetworkObservable();
    }
}