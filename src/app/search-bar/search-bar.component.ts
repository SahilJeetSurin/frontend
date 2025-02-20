import { Component, OnInit, Renderer2, ViewChild, ElementRef, Input, Output, EventEmitter } from "@angular/core";
import { GlobalVarsService } from "../global-vars.service";
import { ActivatedRoute, Router } from "@angular/router";
import { BackendApiService } from "../backend-api.service";
import * as _ from "lodash";

const DEBOUNCE_TIME_MS = 300;

@Component({
  selector: "search-bar",
  templateUrl: "./search-bar.component.html",
  styleUrls: ["./search-bar.component.scss"],
})
export class SearchBarComponent {
  @ViewChild("searchBarRoot", { static: true }) searchBarRoot: ElementRef;
  @Input() isSearchForUsersToMessage: boolean;
  @Output() creatorToMessage = new EventEmitter<any>();
  searchText: string;
  creators = [];
  loading: boolean;
  selectedCreatorIndex: number;
  creatorSelected: string;
  debouncedSearchFunction: () => void;
  globalVars: GlobalVarsService;

  constructor(
    private appData: GlobalVarsService,
    private router: Router,
    private backendApi: BackendApiService,
    private renderer: Renderer2
  ) {
    this.globalVars = appData;
    this.searchText = "";
    this.creatorSelected = "";
    this.selectedCreatorIndex = -1; // -1 represents no creator being selected.
    this._setUpClickOutListener();
    this.debouncedSearchFunction = _.debounce(this._searchUsernamePrefix.bind(this), DEBOUNCE_TIME_MS);
  }

  _searchUsernamePrefix() {
    // store the search text for the upcoming API call
    let requestedSearchText = this.searchText;
    let readerPubKey = "";
    if (this.globalVars.loggedInUser) {
      readerPubKey = this.globalVars.loggedInUser.PublicKeyBase58Check;
    }

    this.backendApi
      .GetProfiles(
        this.globalVars.localNode,
        "" /*PublicKeyBase58Check*/,
        "" /*Username*/,
        this.searchText /*UsernamePrefix*/,
        "" /*Description*/,
        "" /*Order by*/,
        20 /*NumToFetch*/,
        readerPubKey /*ReaderPublicKeyBase58Check*/,
        "" /*ModerationType*/,
        false /*FetchUsersThatHODL*/,
        false /*AddGlobalFeedBool*/
      )
      .subscribe(
        (response) => {
          // only process this response if it came from
          // the request for the current search text
          if (requestedSearchText === this.searchText) {
            this.loading = false;
            this.creators = response.ProfilesFound;
          }
        },
        (err) => {
          // only process this response if it came from
          // the request for the current search text
          if (requestedSearchText === this.searchText) {
            this.loading = false;
          }
          console.error(err);
          this.globalVars._alertError("Error loading profiles: " + this.backendApi.stringifyError(err));
        }
      );
  }

  _handleArrowKey(key: string) {
    // Don't do anything if the search box isn't open.
    if (this.searchText.length == 0) return;

    if (key == "DOWN") {
      // Only update if we aren't at the end of the creator list.
      if (this.selectedCreatorIndex < this.creators.length - 1) {
        this.selectedCreatorIndex += 1;
        this.creatorSelected = this.creators[this.selectedCreatorIndex].Username;
      }
    } else if (key == "UP") {
      // Only update if we aren't at the -1 index.
      if (this.selectedCreatorIndex != -1) {
        this.selectedCreatorIndex -= 1;
        if (this.selectedCreatorIndex == -1) this.creatorSelected = "";
        else this.creatorSelected = this.creators[this.selectedCreatorIndex].Username;
      }
    }
  }

  // This search bar is used for more than just navigating to a user profile. It is also
  // used for finding users to message.  We handle both cases here.
  _handleCreatorSelect(creator: any) {
    if (creator && creator != "") {
      if (this.isSearchForUsersToMessage) {
        this.creatorToMessage.emit(creator);
      } else {
        this.router.navigate(["/" + this.globalVars.RouteNames.USER_PREFIX, creator.Username], {
          queryParamsHandling: "merge",
        });
      }
      this._exitSearch();
    } else {
      // If a user presses the enter key while the cursor is still in the search bar,
      // this user should be redirected to the profile page of the user with the username
      // equal to that of the current searchText.
      if (this.searchText !== "" && !this.isSearchForUsersToMessage) {
        this.router.navigate(["/" + this.globalVars.RouteNames.USER_PREFIX, this.searchText], {
          queryParamsHandling: "merge",
        });
        this._exitSearch();
      }
    }
  }

  _handleMouseOver(creator: string, index: number) {
    this.creatorSelected = creator;
    this.selectedCreatorIndex = index;
  }

  _exitSearch() {
    this.searchText = "";
    this.creatorSelected = "";
    this.selectedCreatorIndex = -1;
  }

  _handleSearchTextChange(change: string) {
    // When the search text changes we reset the arrow key selections.
    this.creatorSelected = "";
    this.selectedCreatorIndex = -1;

    if (change === "") {
      // clear out the creators list to prevent a future search
      // from flashing with a list of creators, and skip
      // making an empty search request as well
      this.creators = [];
    } else {
      // show the loader now before calling the debounced search
      // to improve the user experience
      this.loading = true;
      // Then we filter the creator list based on the search text.
      this.debouncedSearchFunction();
    }
  }

  _setUpClickOutListener() {
    this.renderer.listen("window", "click", (e: any) => {
      if (e.path == undefined) {
        if (e.target.offsetParent === this.searchBarRoot.nativeElement) {
          return;
        }
      } else {
        for (var ii = 0; ii < e.path.length; ii++) {
          if (e.path[ii] === this.searchBarRoot.nativeElement) {
            return;
          }
        }
      }
      // If we get here, the user did not click the selector.
      this._exitSearch();
    });
  }
}
