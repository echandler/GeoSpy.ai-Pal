// ==UserScript==
// @name         GeoSpy.ai Pal 
// @description  Play GeoGuessr with an AI pal! 
// @namespace    AI scripts 
// @version      0.1.1
// @author       echandler
// @match        https://www.geoguessr.com/*
// @grant        none
// @run-at       document-start
// @downloadURL  https://github.com/echandler/GeoSpy.ai-Pal/raw/main/GeoSpayAi_Pal.user.js 
// @copyright    2024 echandler
// @license      MIT
// @noframes
// ==/UserScript==


(function() {
    'use strict';
    const state = {_id: 0, duelsLastRoundNum: null};
    const bermudaTriangleCoords = { lat: 24.960182, lng: -71.022406 }; 
    const onMapLoadCallBacks = [];
    let _canvas = null;

    window.showAltsArray = [];// Lame infowindow hack.

    const _ls = localStorage['aipal']? JSON.parse(localStorage['aipal']): null;
    if (_ls){
        state.AI_PLAYER = _ls[getMapId()];
    }

    window.addEventListener('DOMContentLoaded', (event) => {
        if (!document.documentElement) {
            alert("Script didn't load, refresh to try loading the script");
            return;
        }

        new MutationObserver((mutations, observer) => {
            for (const mutation of mutations) {
                for (const newNode of mutation.addedNodes) {
                    const googleScript = newNode;
                    if (googleScript && googleScript.src && googleScript.src.startsWith('https://maps.googleapis.com/')) {
                        if (googleScript) {

                            const oldOnload = googleScript.onload;
                            googleScript.onload = (event) => {
                                const google = window.google;
                                if (google) {
                                    observer.disconnect();
                                    setListeners();
                                    monkeyPatchGoogleMaps(google);
                                }
                                if (oldOnload) {
                                    oldOnload.call(googleScript, event);
                                }
                            }
                        }
                    }
                }
            }
        }).observe(document.documentElement, { childList: true, subtree: true })
    });

    
    function monkeyPatchGoogleMaps(google) {
            // From unity script.

            const svService = new google.maps.StreetViewService();
            google.maps.StreetViewPanorama = class extends google.maps.StreetViewPanorama {
                constructor(...args) {
                    super(...args);

                    state.svPlayer = this;


                    this.addListener('position_changed', (e) => {
                        if (!state.GoogleMapsObj) {
                            onMapLoadCallBacks.push(() => {
                                google.maps.event.trigger(state.GoogleMapsObj, "sv_position_changed", this);
                            });
                            return;
                        }
                        google.maps.event.trigger(state.GoogleMapsObj, "sv_position_changed", this);
                    });
                }
            };

            google.maps.Map = class extends google.maps.Map {
                constructor(...args) {
                    super(...args);

                    state.GoogleMapsObj = this;

                    onMapLoadCallBacks.forEach(fn => fn()); 
                    onMapLoadCallBacks.length = 0;

                    google.maps.event.trigger(this, "new map", this);
           
                }
            };
        };// End of injector().


    let mainObserver = new MutationObserver((mutations) => {
        // Started making this observer with good intentions!
        // I just don't know the best way of checking for new rounds.

        mutations.forEach((mutation) => {

            if (mutation.removedNodes) {
                for (let m of mutation.removedNodes) {
                    if (!m.classList) break;

                    const classListString = m.classList.toString();
                    const resultLayout = m.classList.length < 3 && /result/.test(classListString); 
                  
                    if (resultLayout){
                        //leaving result page.
                        state.onResultPage = false;
                        google.maps.event.trigger(state.GoogleMapsObj, "remove all markers");
                        google.maps.event.trigger(state.GoogleMapsObj, "leaving result page");
                    }
                     
                    if (m.classList.length < 3 && /in-game_background/i.test(classListString)){
                        // Possibly starting new game.
                        const onResultPage =document.body.querySelector("[class*='result']"); 
                        state.onResultPage = onResultPage? true: false;

                        try {
                            if (!window?.google){
                              const _timer = setTimeout(()=>{
                                  newAlert("Couldn't find google maps object. Contact author of script if error persists.");
                              }, 2000);
                              onMapLoadCallBacks.push(function(){
                                  clearTimeout(_timer);
                                  onResultPage ? google.maps.event.trigger(state.GoogleMapsObj, "result page")
                                      : google.maps.event.trigger(state.GoogleMapsObj, "end game");
                              });                                 
                              
                            } else {
                                onResultPage ? google.maps.event.trigger(state.GoogleMapsObj, "result page")
                                    : google.maps.event.trigger(state.GoogleMapsObj, "end game");
                            }
                        } catch(e){
                           // newAlert("Can't find google maps object. If refreshing the page doesn't work, contact author of script.")
                        }
                    }

                   const isDuelsNewGame = /round-score_container/.test(classListString);
                   if (isDuelsNewGame){
                        google.maps.event.trigger(state.GoogleMapsObj, 'duals new round');
                   }
                    
                }
            }

            if (mutation.addedNodes) {
                for (let m of mutation.addedNodes) {
                    // console.log(m);
                    if (!m.classList) break;

                    const classListString = m.classList.toString();
                    const resultLayout = m.classList.length < 3 && /result.layout/.test(classListString); 
                    const resultListItem = m.classList.length < 3 && /result.list.listWrapper/.test(classListString); 
                    const resultsTable =  m.classList.length < 3 && /results_table/.test(classListString);

                    if (resultLayout){
                        //on result page
                        state.onResultPage = true;
                        if (window?.google){ 
                            google.maps.event.trigger(state.GoogleMapsObj, "result page");
                        } else {
                            setTimeout(()=>{
                                // Try a second time.
                                if (!window?.google) return;
                                    google.maps.event.trigger(state.GoogleMapsObj, "result page");
                                
                                    if (state?.gameInfo?.round < 5) return;
                                    if (!state?.AI_PLAYER?.rounds[4]) return;
                                    // On final round page.
                                    showAIGuess_normalResultPage(state.AI_PLAYER.rounds[4]);
                            }, 2000);
                        }
                    }

                    if (resultListItem){
                        // Standard game finale score page.
                        state.onResultPage = true;
                        google.maps.event.trigger(state.GoogleMapsObj, "standard game final score page");
                    }

                    if (resultsTable){
                        // Challenge final score page.
                        state.onResultPage = true;
                        google.maps.event.trigger(state.GoogleMapsObj, "challenge game final score page");
                    }

                    if (m.getAttribute("data-qa") == "guess-map" || (m.classList.length < 3 && /in-game_background/i.test(classListString))){
                        // Possibly starting new game.
                        // Possibly refreshing page in challenge game.

                        const onResultPage =document.body.querySelector("[class*='result-']"); 
                        state.onResultPage = onResultPage? true: false;

                        try {
                            if (!window?.google){
                                const _timer = setTimeout(()=>{
                                    newAlert("Couldn't find google maps object. Contact author of script if error persists.");
                                }, 3000);

                                onMapLoadCallBacks.push(function(){
                                    clearTimeout(_timer);
                                    onResultPage ? google.maps.event.trigger(state.GoogleMapsObj, "result page")
                                        : google.maps.event.trigger(state.GoogleMapsObj, "new round");
                                    
                                    // Refreshing page on challenges stays on result page, doesn't start new round.
                                    onResultPage && showAIGuess_normalResultPage(state?.AI_PLAYER?.rounds[state?.AI_PLAYER?.rounds?.length -1]);
                                });                                 
                              
                            } else {
                                onResultPage ? google.maps.event.trigger(state.GoogleMapsObj, "result page")
                                    : google.maps.event.trigger(state.GoogleMapsObj, "new round");
                            }
                        } catch(e){
                           // newAlert("Can't find google maps object. If refreshing the page doesn't work, contact author of script.")
                        }
                        
                    }

                    const onPartyPage = /party_root/.test(classListString);//m.querySelector('div[class*="party_root');
                    //const inDuelsGame = m.querySelector('div[class*="in-game_content"]');
                    const inDuelsGame = m.querySelector('div[class*=""]');
                    const isDuelsResulst = /overlay_backdrop/.test(classListString);

                    if (onPartyPage){
                        newAlert("Are you being naughty?", "check") 
                        //alert('on party')
                    }
                    
                    if (inDuelsGame){
                        try {
                            if (!window?.google){
                                const _timer = setTimeout(()=>{
                                    newAlert("Couldn't find google maps object. Contact author of script if error persists.");
                                }, 3000);

                                onMapLoadCallBacks.push(function(){
                                    clearTimeout(_timer);
                                    google.maps.event.trigger(state.GoogleMapsObj, "new round");
                                });                                 
                              
                            } else {
                                    google.maps.event.trigger(state.GoogleMapsObj, "new round");
                            }
                        } catch(e){
                           // newAlert("Can't find google maps object. If refreshing the page doesn't work, contact author of script.")
                        }
                    }
                    
                    if (isDuelsResulst){
                        window?.google?.maps?.event?.trigger(state.GoogleMapsObj, "result page");
                        return;
                    }
                    
                    const showingDuelsTimer = /clock-timer/i.test(classListString);
                    if (showingDuelsTimer){
                        
                        window?.google?.maps?.event?.trigger(state.GoogleMapsObj, "showing duels timer");
                        return;
                    }
                
                    const dualsGameFinished = /game-finished_/i.test(classListString);
                    if (dualsGameFinished){
                        if (!window?.google) {
                            const _interval = setInterval(()=>{
                                if (!window?.google) return;
                                clearInterval(_interval);
                                google.maps.event.trigger(state.GoogleMapsObj, "duels game finished");
                            }, 1000);
                            
                        } else {
                            google.maps.event.trigger(state.GoogleMapsObj, "duels game finished");
                        }
                        return;
                    }
                }
            }
        });
    });// End MainObserver.

    mainObserver.observe(document.body, {childList: true, subtree: true, attributes: false, characterData: false})
    
    function setListeners(){
        if (state.listenersSet) return;

        if (!state.GoogleMapsObj){
            onMapLoadCallBacks.push(setListeners);
            return;
        }

        state.listenersSet = true;

        state.GoogleMapsObj.addListener('click', (e) => {
            state.playerMapClickPos = e.latLng.toJSON();
        });

        google.maps.event.addListener(state.GoogleMapsObj, "new round", newRoundFn);
        google.maps.event.addListener(state.GoogleMapsObj, "end game", endOfGame);
        google.maps.event.addListener(state.GoogleMapsObj, "result page", onResultPageFn);
        google.maps.event.addListener(state.GoogleMapsObj, "sv_position_changed", sv_position_changed);
        google.maps.event.addListener(state.GoogleMapsObj, "AI response finished", updateAICurRound );
        google.maps.event.addListener(state.GoogleMapsObj, "AI response finished", duals.waitToUpdateDuelsGame );
        google.maps.event.addListener(state.GoogleMapsObj, "showing duels timer", duals.updateDuelsTimer );
        google.maps.event.addListener(state.GoogleMapsObj, "duels game finished", duals.duelsGameFinished );
        google.maps.event.addListener(state.GoogleMapsObj, "standard game final score page", showAIGuess_standard_finalResultsPage );
        google.maps.event.addListener(state.GoogleMapsObj, "challenge game final score page", ()=> setTimeout(showAIGuess_challenge_finalResultsPage, 1000) );

      //  google.maps.event.addListener(state.GoogleMapsObj, "new round", forTesting.unHidePage);
      //  google.maps.event.addListener(state.GoogleMapsObj, "result page", forTesting.hidePage);
      //  google.maps.event.addListener(state.GoogleMapsObj, "AI response finished", forTesting.putMarkerOnMap);
    }
    
    function sv_position_changed(sv){
        if (state.curPanoId || state.onResultPage) return;

        state.curPanoId = sv.getPano();

        if (!state?.curPanoId || state?.curPanoId?.length !== 22) {
            if (state?.curPanoId && state?.curPanoId?.length !== 22) {
                newAlert("Doesn't appear to be official coverage. It's not going to work for this round.", false, "show x");
            }
            return;
        }

        state.curLatLng = sv.position.toJSON();

        state.needToTalkToAi = false;

        state.inaGame = true;

        talkToAi(state.curPanoId);
    }

    const forTesting = {
        unHidePage: function (){

            document.body.style.visibility = '';
            try{ 
            document.body.querySelector('div[class*="round-result_distanceIndicatorWrapper"]').style.visibility = "";
            document.body.querySelector('div[class*="round-result_pointsIndicatorWrapper"]').style.visibility = "";
            } catch(e){}
        },

        hidePage: function (){
            document.body.style.visibility = 'hidden';
            try{ 
            document.body.querySelector('div[class*="round-result_distanceIndicatorWrapper"]').style.visibility = "hidden";
            document.body.querySelector('div[class*="round-result_pointsIndicatorWrapper"]').style.visibility = "hidden";

            alert('Hidding Results page!')
            } catch(e){}
        },

        putMarkerOnMap: function (curGuess){

            try{
                // Show marker, but it will error out when it tries to find score nodes for standard game.
                // I don't want to make a marker function just for duals...yet.
                const listener2 = google.maps.event.addListener(state.GoogleMapsObj, "duals new round", ()=>{
                    google.maps.event.trigger(state.GoogleMapsObj, "remove all markers");
                    google.maps.event.removeListener(listener2);
                });

                state.GoogleMapsObj.setZoom(10);
                state.GoogleMapsObj.setCenter(curGuess.latLng || curGuess.countryLatLng);

                showAIGuess_normalResultPage(curGuess, "ignore result page state", "don't change bounds");
            } catch(e){}

        }
    };
     
    const duals = {

        duelsGameFinished: function () {
            // Reset game number for next game.
            state.duelsLastRoundNum = null;

            setTimeout(() => {
                document.body.querySelectorAll('a').forEach(async btn => {
                    if (!/continue/i.test(btn.innerText)) return;
                    //                    setTimeout(() => btn.click(), 3000);
                });
            }, 3000);
        },

        updateDuelsTimer: function (curGuess) {
            // TODO: Do something here.
        },

        waitToUpdateDuelsGame: function (curGuess) {
            if (!isDuelsGame()) return;

            if (state.gameInfo.currentRoundNumber != curGuess.curRound) {
                newAlert("Couldn't guess in time.");
                return;
            }

            let stillOnResultsPage = document.body.querySelector('div[class*="overlay_backdrop"]');
            if (stillOnResultsPage) {
                setTimeout(() => duals.waitToUpdateDuelsGame(curGuess), 1000);
                newAlert("Still on results page");
                return;
            }

            try {
                // Show marker, but it will error out when it tries to find score nodes for standard game.
                // I don't want to make a marker function just for duals...yet.
                const listener2 = google.maps.event.addListener(state.GoogleMapsObj, "duals new round", () => {
                    google.maps.event.trigger(state.GoogleMapsObj, "remove all markers");
                    google.maps.event.removeListener(listener2);
                });

                state.GoogleMapsObj.setZoom(3);
                state.GoogleMapsObj.setCenter(curGuess.latLng || curGuess.countryLatLng);

                showAIGuess_normalResultPage(curGuess, "ignore result page state", "don't change bounds");
            } catch (e) { }

            if (document.querySelector('[class*="clock-timer"]')) {
                duals.updateDuelsGame(curGuess);
                return;
            }

            const listener1 = google.maps.event.addListener(state.GoogleMapsObj, "showing duels timer", () => {
                clearTimeout(_timer);
                google.maps.event.removeListener(listener1);
                setTimeout(() => duals.updateDuelsGame(curGuess), 3000 + (Math.random() * 5000));
            });

            const randomTime = 4000 + (Math.random() * 10000);

            newAlert(`Will make guess in ${(randomTime / 1000).toFixed(1)} seconds!`);

            const _timer = setTimeout(() => {
                // Give some "realism" by not making the guess immediately.
                google.maps.event.removeListener(listener1);
                duals.updateDuelsGame(curGuess);
            }, randomTime);
        },

        updateDuelsGame: function (curGuess) {
            if (!isDuelsGame()) return

            if (state.gameInfo.currentRoundNumber === state.duelsLastRoundNum || state.duelsLastRoundNum === null) {
                state.gameInfo.currentRoundNumber++;
                state.duelsLastRoundNum = state.gameInfo.currentRoundNumber;
            } else {
                alert("Something happened: wrong round number. Can't make guess.")
                return;
            }

            const message = curGuess?.json?.message;

            if (!curGuess.latLng && !curGuess.countryLatLng) {
                newAlert("Couldn't find coordinates in response.");
                if (message) {
                    newAlert("Check Dev tools console for AI response.");
                }
                return;
            } else {
                duals.duelsSendGuessToServer(curGuess.latLng || curGuess.countryLatLng, curGuess.curRound);
            }

            if (message) {
                console.log("AI RESPONSE:", curGuess.json.message);
            }
        },

        duelsSendGuessToServer: async function (latLng, roundNumber) {
            let gameId = location.pathname.split("/")[2];

            if (!roundNumber) {
                newAlert("Something is wrong, can't see round number.");
                newAlert("Can't make guess right now.");
                return;
            }

            newAlert("Making guess now!");
            // return;
            return await fetch(`https://game-server.geoguessr.com/api/duels/${gameId}/guess`, {
                "headers": {
                    "accept": "*/*",
                    "accept-language": "en-US,en;q=0.8",
                    "content-type": "application/json",
                    "sec-fetch-dest": "empty",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "same-site",
                    "sec-gpc": "1",
                    "x-client": "web"
                },
                "referrer": "https://www.geoguessr.com/",
                "referrerPolicy": "strict-origin-when-cross-origin",
                "body": JSON.stringify({ "lat": latLng.lat, "lng": latLng.lng, "roundNumber": roundNumber }),
                "method": "POST",
                "mode": "cors",
                "credentials": "include"
            });
        },
    };
    
    function showAIGuess_challenge_finalResultsPage(){
        google.maps.event.trigger(state.GoogleMapsObj, "remove all markers");

        state.AI_PLAYER.rounds.forEach( (round, idx) => {
            if (!round?.infoWindowOpened) return;
            round.infoWindowOpened = false;
        });

        _showAIGuess_challenge_finalResultsPage();
    }

    function _showAIGuess_challenge_finalResultsPage(){
        const table = document.querySelector(`div[class*="results_table"]`);
        const firstRow = table.children[2];
        const AI_row = firstRow.cloneNode(true);
        const AI_userLink = AI_row.querySelector('div[class*="userLink"]'); 
        const AI_nick = AI_row.querySelector(`div[class*="user-nick_nick_"]`);        
        const AI_avatar = AI_row.querySelector(`div[class*="avatar"]`);        
        const AI_resultsPos = AI_row.querySelector(`span[class*="results_position"]`);
        const AI_resultsScores= AI_row.querySelectorAll(`div[class*="_score_"]`);
        const AI_scoreDetails = AI_row.querySelectorAll(`div[class*="scoreDetails"]`);
        
        // One row will be selected by default that has both selected and non-selected classes.
        const selectedRowClasses = [...document.querySelector(`div[class*="results_selected"]`).classList];
        const selectedClass = selectedRowClasses.reduce((acc, cur) => /selected/i.test(cur) && cur);

        AI_row.addEventListener('click', ()=>{
           if (/selected/i.test(AI_row.classList.toString())){
                // Remove selected class.
                AI_row.classList.remove(selectedClass);
                google.maps.event.trigger(state.GoogleMapsObj, "remove all markers");
                return;
           }
            // Add selected class.
            AI_row.classList.add(selectedClass);
            updateChallengeInfo();
        });

        selectedRowClasses.forEach(el =>{
            // Show AI_row selected by copying classes from a selected row.
            AI_row.classList.add(el);
        })
        
        if (AI_userLink){
            AI_userLink.querySelector('a').href = "https://geospy.ai/";
        }

        AI_nick.nextSibling.remove(); // Remove flag.

        AI_nick.innerText = "GeoSpy.ai Pal";

        AI_avatar.style.visibility = 'hidden';

        AI_resultsPos.innerText = "01."
        
        function updateChallengeInfo(){              
            const totals = state.AI_PLAYER.rounds.reduce((acc, curval, idx, array) => {
                if (!curval) {
                    return acc;
                }
                return [acc[0] + curval.points, acc[1] + curval.distance];
            }, [0, 0]);

            AI_scoreDetails.forEach((el, idx) =>{
                const _innerText = el.innerText;

                el.innerText = "?"; 

                if (idx === 5){
                    // Total element
                    const unit = /miles/i.test(_innerText);

                    const converted = convertDistanceTo(totals[1], unit? "miles": "km");

                    el.innerText = `${Math.round(converted.distance).toLocaleString()} ${converted.unit}`;

                } else if (state.AI_PLAYER.rounds[idx]){
                    const unit = /miles/i.test(_innerText);
                    const converted = convertDistanceTo(state.AI_PLAYER.rounds[idx].distance, unit? "miles": "km");
                    el.innerText = `${Math.round(converted.distance).toLocaleString()} ${converted.unit}`;
                }
            });

            AI_resultsScores.forEach((el, idx) =>{
                el.innerText = "?"; 

                if (idx === 5){
                    // Total element

                    el.innerText = `${totals[0]} pts`;

                } else if (state.AI_PLAYER.rounds[idx]){
                    el.innerText = `${state.AI_PLAYER.rounds[idx].points} pts`;
                }
            });
        
            state.AI_PLAYER.rounds.forEach( (round, idx) => {
                showAIGuess_marker(round, dragEndCb, true, false);
            });
        }

        updateChallengeInfo();

        table.insertBefore(AI_row, firstRow);
        
        function dragEndCb(el){
            updateChallengeInfo();
        }
    } // End showAIGuess_challenge_finalResultsPage

    function showAIGuess_standard_finalResultsPage(){
        google.maps.event.trigger(state.GoogleMapsObj, "remove all markers");

        state.AI_PLAYER.rounds.forEach( (round, idx) => {
            if (!round?.infoWindowOpened) return;
            round.infoWindowOpened = false;
        });

        _showAIGuess_standard_finalResultsPage();
    }

    function _showAIGuess_standard_finalResultsPage(){
        const layout = document.querySelector('div[class*="list_listWrapper"]');
        const header = document.querySelector('div[class*="list_mapAndSettingsWrapper"]');
        const AI_layout = layout.cloneNode(true);
        const AI_header = header.cloneNode(true);

        // Hack for observer infinite loop issue.
        AI_layout._classListString = AI_layout.classList.toString();
        AI_layout.classList = [];

        AI_header.style.cssText = `position: absolute; margin-top: 0px; right: 2em; top: 2em; left: auto; bottom: auto; pointer-events:all;`;
        AI_layout.style.cssText = `position: absolute; margin-top: 0px; right: 2em; top: 4em; pointer-events:all;visibility:hidden;`;
        
        AI_header.innerHTML = `<p>GeoSpy.ai Pal</p>`;

        layout.parentElement.appendChild(AI_layout);
        layout.parentElement.appendChild(AI_header);
        
        function updateScoreBoard(){
            AI_layout.childNodes.forEach((el, idx) => {
                const _id = state._id++;

                let score = "?";
                let distance = "?";

                if (state.AI_PLAYER.rounds[idx]) {
                    let round = state.AI_PLAYER.rounds[idx];
                    score = round.points;
                    distance = round.distance;

                } else if (/total/i.test(el.innerHTML)) {
                    const totals = state.AI_PLAYER.rounds.reduce((acc, curval, idx, array) => {
                        if (!curval) {
                            return acc;
                        }
                        return [acc[0] + curval.points, acc[1] + curval.distance];
                    }, [0, 0]);

                    score = totals[0];
                    distance = totals[1];
                }

                el.querySelector(`div[class*="list_points"]`).innerHTML = score.toLocaleString() + " pts";

                const roundInfoEL = el.querySelector(`div[class*="list_roundInfo"]`);
                const unit = /miles/.test(roundInfoEL.innerHTML) ? "miles" : "km";

                if (distance != "?") {
                    distance = convertDistanceTo(distance, unit);
                    distance.distance = parseFloat(distance.distance.toFixed(2)).toLocaleString();
                }

                roundInfoEL.innerHTML = `${distance.distance} ${distance.unit}`;
            });

            //state.AI_PLAYER.rounds.forEach( (el, idx) => makeFinalResultsPageMarkers(el, dragEndCb, ));
            state.AI_PLAYER.rounds.forEach( (round, idx) => {
                showAIGuess_marker(round, dragEndCb, true, false);
            });
        }

        updateScoreBoard();

        function dragEndCb(el){
          updateScoreBoard();
          //  AI_header.remove();
          //  AI_layout.remove();

          //  _showAIGuess_standard_finalResultsPage();
        }

        setTimeout(()=>{
            // So that it doesn't trip up the observer and go into an infinite loop.
            AI_layout.className = AI_layout._classListString;
            AI_layout.style.visibility = 'visible';
        }, 100);
    } // End showAIGuess_standard_finalResultsPage
    
    async function newRoundFn(){
        if (!state?.gameInfo){
            // Get inital game info from __NEXT__DATA__ maybe because player refreshed on a challenge games.
            const info = JSON.parse(document.getElementById("__NEXT_DATA__").innerHTML); 
            state.gameInfo = info?.props?.pageProps?.gameSnapshot;
        }

        if (state.gameInfo.round === 1 && !document.body.querySelector("[class*='result-']")){
            // Reset values on new game.
            //newAlert("New round- cleared state.AI_PLAYER.rounds");
            state.AI_PLAYER.rounds = [];
            saveRounds();
        }
        
        state.playerMapClickPos = null;
    }
    
    function endOfGame(){
        state.needToTalkToAi = true;     
        state.curPanoId = null; 
        state.curLatLng = null; 
        state.inaGame = false;
    }

    async function onResultPageFn(){
        state.needToTalkToAi = true;     
        state.curPanoId = null; 
        state.curLatLng = null; 
    }
    
    function showAIGuess_marker(curGuess, dragEndCb, dontChangeBounds, showInfoWindowOnCreate){
        if (!curGuess || !curGuess?.curRound) {
            // newAlert("Can't find round");
            return;
        }

        const _id = state._id++;

        let latLng = curGuess?.latLng || curGuess?.countryLatLng;
        if (!latLng || isNaN(latLng.lat) || isNaN(latLng.lng)) {
            // TODO EC: Change coords to Bermuda triangle?
            latLng = bermudaTriangleCoords;
        }

        if (curGuess.marker) {
            curGuess.marker.setMap(null);
        }

        curGuess.marker = new google.maps.Marker({
            position: latLng,
            map: state.GoogleMapsObj,
            draggable: true,
            label: {
                text: `${curGuess.curRound}`,
                color: '#fff',
                fontSize: '19px',
                fontWeight: 'bold',
                fontFamily: 'var(--default-font)'
            },
        });

        curGuess.marker.isDraggin = false;

        const infoWindow = new google.maps.InfoWindow({
            map: state.GoogleMapsObj,
            content: makeInfoWindowContent(curGuess, drag, dragEnd, _id),
            disableAutoPan: true,
        });
        
        const _infoWin_open = infoWindow.open;

        infoWindow.open = (obj) => {
            // Hack to prevent infowindow from closing if player is reading the ai response message.
            _infoWin_open.call(infoWindow, obj); 
            setTimeout(()=>{
                document.getElementById(`geospy_response_${_id}`).addEventListener("mousedown", ()=> { clearTimeout(closeInfoWindowTimeout)});
            }, 500);
        };

        if (curGuess.infoWindowOpened) {
            infoWindow.open({ anchor: curGuess.marker });
        }

        let closeInfoWindowTimeout = null;

        if (curGuess.infoWindowOpened === undefined && showInfoWindowOnCreate) {
            closeInfoWindowTimeout = setTimeout(() => {
                infoWindow.close();
                curGuess.infoWindowOpened = false;
            }, 5000);
            
            curGuess.infoWindowOpened = true;

            infoWindow.open({ anchor: curGuess.marker });

            shootTarget(curGuess.marker.getPosition().toJSON(), curGuess.svPos);
        }

        if (!dontChangeBounds) {
            const _bounds = new google.maps.LatLngBounds();
            _bounds.extend(curGuess.marker.getPosition());
            _bounds.extend(curGuess.svPos);

            if (curGuess.playerMapClickPos) _bounds.extend(curGuess.playerMapClickPos);

            setTimeout(() => {
                // Don't want battle geoguessr's animation.
                state.GoogleMapsObj.fitBounds(_bounds);
            }, 1000);
        }

        curGuess.marker.addListener('click', () => {
            if (curGuess.marker.isDraggin) return;

            clearTimeout(closeInfoWindowTimeout);

            curGuess.infoWindowOpened = !curGuess.infoWindowOpened;

            if (curGuess.infoWindowOpened) {
                infoWindow.open({ anchor: curGuess.marker })
                shootTarget(curGuess.marker.getPosition().toJSON(), curGuess.svPos);
            } else {
                infoWindow.close();
            }
        });

        google.maps.event.addListener(infoWindow, 'closeclick', function () {
            curGuess.infoWindowOpened = false;
        });

        google.maps.event.addListener(curGuess.marker, 'drag', drag);
        google.maps.event.addListener(curGuess.marker, 'dragend', dragEnd);

        function drag(e) {
            try {
                // infowindow might be closed.
                curGuess.marker.isDraggin = true;
                clearTimeout(closeInfoWindowTimeout);
                const lat = curGuess.marker.getPosition().lat().toFixed(6);
                const lng = curGuess.marker.getPosition().lng().toFixed(6);
                document.getElementById("lat" + _id).innerText = lat;
                document.getElementById("lng" + _id).innerText = lng;
            } catch (e) { }
        };

        function dragEnd(e) {
            curGuess.marker.isDraggin = false;

            const pos = curGuess.marker.getPosition().toJSON();

            updateAICurRound(curGuess, pos);

            curGuess.latLngNeg = false;

            if (document.getElementById("googMapLink" + _id)) {
                const lat = curGuess.marker.getPosition().lat().toFixed(6);
                const lng = curGuess.marker.getPosition().lng().toFixed(6);
                document.getElementById("googMapLink" + _id).href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
            }

            dragEndCb(e);
        };

        const markerListener1 = google.maps.event.addListener(state.GoogleMapsObj, 'remove final round markers', () => {
            google.maps.event.removeListener(markerListener1);
            curGuess.marker.setMap(null);
        });

        const markerListener2 = google.maps.event.addListener(state.GoogleMapsObj, 'new round', () => {
            google.maps.event.removeListener(markerListener2);
            curGuess.marker.setMap(null);
        });

        const markerListener3 = google.maps.event.addListener(state.GoogleMapsObj, "end game", () => {
            google.maps.event.removeListener(markerListener3);
            curGuess.marker.setMap(null);
        });

        const markerListener4 = google.maps.event.addListener(state.GoogleMapsObj, "remove all markers", () => {
            google.maps.event.removeListener(markerListener4);
            curGuess.marker.setMap(null);
        });
    }

    function showAIGuess_normalResultPage(curGuess, ignoreResultPageState, dontChangeBounds){
        if (!curGuess) {
            newAlert("Info. for this round wasn't found.", false, "x");
            return;
        }

        if (!ignoreResultPageState && !state.onResultPage) return;

        if (curGuess.state != "Done" && !curGuess.savedRound){
            const cSS = `text-decoration: underline; text-decoration-color: #ff9800;`;
            newAlert(`<div style="${cSS}">AI is still working hard on round #${curGuess.curRound}</div>`);

            const listener = google.maps.event.addListener(state.GoogleMapsObj, "AI response finished", function(){
                google.maps.event.removeListener(listener);
                showAIGuess_normalResultPage(curGuess);
            });
            return;
        }
        
        if (state.playerMapClickPos){
            curGuess.playerMapClickPos = state.playerMapClickPos;            
            saveRounds();
        }

        showAIGuess_marker(curGuess, dragEndCb, dontChangeBounds, true);
        
        function dragEndCb(e){
            showAIGuess_normalResultPage(curGuess, "ignore result page state", "dont change bounds")
        }

        let scoreNode = document.body.querySelector('div[class*="round-result_pointsIndicator"]').firstChild;
        let distanceNode = document.body.querySelector('div[class*="round-result_distanceIndicator"]').firstChild;
        let AI_scoreNode = document.getElementById("AI_scoreNode");
        let AI_distanceNode = document.getElementById("AI_distanceNode");
    
        if (!AI_scoreNode){
            AI_scoreNode = scoreNode.cloneNode(true);
            AI_scoreNode.id = "AI_scoreNode";
            AI_distanceNode = distanceNode.cloneNode(true);
            AI_distanceNode.id = "AI_distanceNode";
            scoreNode.parentElement.appendChild(AI_scoreNode);
            distanceNode.parentElement.appendChild(AI_distanceNode);
        }

        AI_scoreNode.children[0].firstChild.innerHTML = curGuess?.points?.toLocaleString() || 0;
        AI_scoreNode.style.textShadow = `0 .25rem 0 #5fbf2e, .125rem .125rem .5rem #8fe945, 0 -.25rem .5rem #3dff51, -.25rem .5rem .5rem #51fe19, 0 .375rem 2rem #45e1e9, 0 0 0 #4562e9, 0 0 1.5rem #4550e9, .25rem .25rem 1rem #3c19fe`;
    
        const unit = /miles/i.test(distanceNode.innerText)? "miles": "km";
        let distance = convertDistanceTo(curGuess?.distance, unit);
        distance.distance = Math.round(parseFloat(distance?.distance.toFixed(2))).toLocaleString();
        distance.distance = (curGuess?.distance) ? distance?.distance : "?";

        if (/timed out/i.test(AI_distanceNode.innerText)){
            
            let unit = "?";

            if (window?.__NEXT_DATA__){
                unit = /\{0\} miles/i.test(JSON.stringify(window?.__NEXT_DATA__)) ? "miles": "kms"; 
            };
           
            AI_distanceNode.innerHTML = `<div style="text-shadow: ${AI_scoreNode.style.textShadow}">${distance?.distance} ${unit}</div>`

            return;
        }

        AI_distanceNode.children[0].firstChild.innerHTML = distance?.distance; 
        AI_distanceNode.children[0].style.textShadow = AI_scoreNode.style.textShadow;// Distance text node.
        AI_distanceNode.children[1].firstChild.style.textShadow = AI_scoreNode.style.textShadow;// Units (miles/kilometers) text node.
        AI_distanceNode.children[1].firstChild.innerHTML = distance?.unit;
    }
    
    function makeInfoWindowContent(curGuess, drag, dragEnd, _id){
        let latLng = curGuess.latLng || curGuess.countryLatLng;
        let isBermuda = false;

        if (!latLng || isNaN(latLng.lat)|| isNaN(latLng.lng)){
            // TODO EC: Change coords to Bermuda triangle?
            latLng = bermudaTriangleCoords;
            isBermuda = true;
        }
        
        const AIMsg = curGuess.json.message.replace(/^\s*/, "");

        window.showAltsArray[curGuess.curRound] = (latLng, _id)=>{
            const lat = (Math.abs(latLng.lat)).toFixed(3); const lng = (Math.abs(latLng.lng)).toFixed(3);
            const el = document.getElementById('showAlts'+_id);
            el.innerHTML = '';
            el.title = "These coordinates could be what you want,\nclick on one to move the marker there.\nSometimes the AI forgets a '-' sign. 9_9";
            const anchor1 = document.createElement('a'); anchor1.href = "#";
            anchor1.innerHTML = `<span style="text-decoration_1:underline">${lat}, ${lng}</span><span> ; </span>`;
            anchor1.onclick = (e)=> {
                e.preventDefault();
                curGuess.marker.setPosition({lat: Math.abs(latLng.lat), lng: Math.abs(latLng.lng) });
                drag(); dragEnd();
            };
            el.appendChild(anchor1);
            const anchor2 = document.createElement('a'); anchor2.href = "#";
            anchor2.innerHTML = `<span style="text-decoration_1:underline">-${lat}, -${lng}</span><span> ; </span>`;
            anchor2.onclick = (e)=> {
                e.preventDefault();
                curGuess.marker.setPosition({lat: -Math.abs(latLng.lat), lng: -Math.abs(latLng.lng) });
                drag(); dragEnd();
            };
            el.appendChild(anchor2);
            const anchor3 = document.createElement('a'); anchor3.href = "#";
            anchor3.innerHTML = `<span style="text-decoration_1:underline">-${lat}, ${lng}</span><span> ; </span>`;
            anchor3.onclick = (e)=> {
                e.preventDefault();
                curGuess.marker.setPosition({lat: (-Math.abs(latLng.lat)), lng: Math.abs(latLng.lng) });
                drag(); dragEnd();
            };
            el.appendChild(anchor3);
            const anchor4 = document.createElement('a'); anchor4.href = "#";
            anchor4.innerHTML = `<span style="text-decoration_1:underline">${lat}, -${lng}</span>`;
            anchor4.onclick = (e)=> {
                e.preventDefault();
                curGuess.marker.setPosition({lat: Math.abs(latLng.lat), lng:(-Math.abs(latLng.lng)) });
                drag(); dragEnd();
            };
            el.appendChild(anchor4);
        } 

        const neg = curGuess.latLngNeg;
        
        let _latLng = curGuess._latLng;

        const isCountryLatLng = (latLng.lat === curGuess?.countryLatLng?.lat) && (latLng.lng === curGuess?.countryLatLng?.lng);
        
        const backgroundURL = `right bottom no-repeat url('data:image/jpeg;base64,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')`;
        const backgroundCSS= `background: ${backgroundURL}; background-size: 70%;`;

        // Standard game infowindow content
        const infoWindowContent = `<div id="geospy_response_${_id}" style="color:#111;font-family: var(--default-font);${backgroundCSS}">
                            Response from GeoSpy.ai Pal:
                            <pre style="max-width: 30em; background-color: #eee; overflow-x: scroll; 
                                        padding: 5px; scrollbar-color: grey white; 
                                        scrollbar-width: thin;">${AIMsg}</pre>
                            Coordinates for calculating points: 
                                ${_latLng ?`<span onclick="showAltsArray[${curGuess.curRound}]({lat:${_latLng.lat}, lng:${_latLng.lng}}, ${_id});" style="color:${neg && "green"}" title="**Click for addition coordinate options** \nIf the coord is green: it was modified to address a common \nerror with the AI response and could be wrong." >`: ''}
                                    <span id="lat${_id}">${latLng.lat.toFixed(6)}</span>, <span id="lng${_id}">${latLng.lng.toFixed(6)}</span>
                                </span>
                                <div id="showAlts${_id}"></div>
                                ${isCountryLatLng ?`<div style="color: green">Using generic country coordinates.</div>`:``}
                                ${isBermuda? `<div style="color: green">Could not find country name or coordinates in response.</div>`: "" }
                            <br>
                            <a style="text-decoration: underline;" id="googMapLink${_id}" href="https://www.google.com/maps/search/?api=1&query=${latLng.lat},${latLng.lng}" target="_blank"> View on Google Maps</a>
                            <br> <br>
                            Hint: Drag marker anywhere that you want.
                            <br> <br>
                            </div>`;

            return infoWindowContent;
        }

    function convertDistanceTo(distance, unit){
        // distance should be in meters.
        const imperial = unit === 'miles' || unit === 'yards';

        let res = imperial? distance * 0.0006213712 : distance / 1000; 
        if (res < 1){
            res = imperial? distance * 1.09361 : distance; 
            unit = imperial? "yards": 'meters';
        }

        return {unit: unit, distance: res};
    }

    function hideAIGuess(curGuess){
        curGuess?.marker?.setMap(null);
    }

    function getPathName(){
        // Hopefully this fixes most issues with localization.
        // Thanks to Destroy666x for bringing this to our attention.
        // https://github.com/echandler/Geoguessr-Unity-Script-Fork/issues/1
        return location.pathname.replace(/^\/[a-z]{2}\//i, "/"); 
    }
    
    function getGameInfo(){
        const __NEXT_DATA__ = document.getElementById("__NEXT_DATA_");
        if (window?.google){
            return window.google;
        } else if (__NEXT_DATA__){
            const json = JSON.parse(__NEXT_DATA__.innerHTML);
            
        }_
    }

    function getMapId(){
        return location.href.replace(/.*\/(.*)/, "$1");
    }

    function d2p(d, D) {
        // From Nicolas on discord.
        // https://discord.com/channels/867130388777926687/867130389222916158/1239094758194806784

        if (d <= 25) {
            return 5000;
        } else {
           // return Math.round(5000 * Math.pow(0.99866017, (distance * 1000) / scale))
            return Math.round(5000 * Math.exp(- 10 * d / D));
            /*
                // From enigma_mf on discord.
                return Math.round(5000 * Math.pow(0.99866017, (distance * 1000) / scale))
            */
        }
    }


   // <canvas id="canvas" height="4096" width="8192"></canvas>
    
    function updateAICurRound(curGuess, _latLng){

        if (!google?.maps.geometry){
            newAlert("Google Geometry not available, switching to less accurate method.", "check")
            google.maps.geometry = {
                spherical : {
                    computeDistanceBetween: _distance,
                }
            }
        }

        let points = null;
        let guessDistance = null; 

        if (!state?.gameInfo?.bounds && !state?.gameInfo?.mapBounds){
            // TODO: Put this in a function.
            const info = JSON.parse(document.getElementById("__NEXT_DATA__").innerHTML); 
            state.gameInfo = info?.props?.pageProps?.gameSnapshot || info?.props?.pageProps?.gamePlayedByCurrentUser;
        }

        const bounds = state?.gameInfo?.bounds || state?.gameInfo?.mapBounds;

        if (_latLng){

            guessDistance = google.maps.geometry.spherical.computeDistanceBetween(curGuess.svPos, _latLng);
            points = d2p( guessDistance, google.maps.geometry.spherical.computeDistanceBetween(bounds.min, bounds.max));
            curGuess.latLng = _latLng;

        } else if (curGuess.latLng){

            guessDistance = google.maps.geometry.spherical.computeDistanceBetween(curGuess.svPos, curGuess.latLng);
            points = d2p( guessDistance, google.maps.geometry.spherical.computeDistanceBetween(bounds.min, bounds.max));

        } else if (curGuess.countryLatLng){

            guessDistance = google.maps.geometry.spherical.computeDistanceBetween(curGuess.svPos, curGuess.countryLatLng)
            points = d2p( guessDistance, google.maps.geometry.spherical.computeDistanceBetween(bounds.min, bounds.max));

        }

        curGuess.points = curGuess.badResponse? 0: points; 
        curGuess.distance = curGuess.badResponse? 0: guessDistance;
        
        state.AI_PLAYER.rounds[curGuess.curRound-1] = curGuess;

        saveRounds();

        google.maps.event.trigger(state.GoogleMapsObj, "updatedAICurRound", state.AI_PLAYER.rounds[curGuess.curRound-1] );
    }
    
    function saveRounds(){
        let rounds = [];

        state.AI_PLAYER.rounds.forEach((el, idx) =>{
            if (!el) return;
            rounds[idx] = {
                curRound: el.curRound,
                latLng : el.latLng,
                _latLng: el._latLng,
                latLngNeg: el.latLngNeg,
                countryLatLng: el.countryLatLng,
                points: el.points,
                distance: el.distance,
                json: el.json,
                savedRound: true,
                svPos: el.svPos,
                badResponse: el.badResponse,
                curMapId: el.curMapId,
                playerMapClickPos: el.playerMapClickPos,
                mapMaker: el.mapMaker,
                state: el.state,
                savedDate: Date.now(),
            };
        });

        const ls = localStorage["aipal"]? JSON.parse(localStorage["aipal"]) : {};
        const mapId = getMapId();  
        
        ls[mapId] = {rounds: rounds};

        localStorage["aipal"] = JSON.stringify(ls);
    }
    
    async function doSendToMapMaking(curGuess){
        if (curGuess.badResponse) return;

        const _points = d2p(curGuess.distance, 20037508.342789244);
   
        if (_points < 4850) return;

        let deleteThis = (curGuess.mapMaker.id > -1)? curGuess.mapMaker.id : null;

        const obj = { ...curGuess.mapMaker };
        obj.tags = [...curGuess.mapMaker.tags];

        obj.tags.push(JSON.stringify({msg: curGuess?.json?.message, pts: _points}));

        const latLng = curGuess.latLng || curGuess._latLng || curGuess.countryLatLng;

        obj.tags.push(JSON.stringify(latLng));

        let newId = await sendLocation(obj, curGuess.curRound, _points, deleteThis);

        const id = curGuess.mapMaker.id;

        curGuess.mapMaker.id = newId[id];

        saveRounds();
    }

    function isDuelsGame(){
        return /duels/.test(location.href);
    }

    async function talkToAi(panoId){
        const _round = state?.gameInfo?.currentRoundNumber || state?.gameInfo?.round;
        
        if (!state?.GoogleMapsObj) {
            setTimeout(()=>{
                talkToAi(panoId);
            }, 100);
            return;
        }
        
        if (!_round){
            const newRoundListener = google.maps.event.addListener(state.GoogleMapsObj, "new round",()=>{
                google.maps.event.removeListener(newRoundListener);
                talkToAi(panoId);
            });
            return;
        }
        
        const pov = state.svPlayer.getPov();
        const zoom = state.svPlayer.getZoom();
        const panoid =state.svPlayer.getPano(); 

        let curGuess = { 
            state: "Downloading Panorama", 
            svPos: state.svPlayer.position.toJSON(), 
            curRound : _round? _round: null, 
            curMapId : getMapId(),
            mapMaker: 	{
                id: -1,
                location: state.svPlayer.position.toJSON(),
                panoId: panoid ?? null,
                heading: pov.heading,
                pitch: pov.pitch,
                zoom: zoom === 0 ? null : zoom,
                tags: [Date.now()+""],
                flags: panoid ? 1 : 0
            },
        }; 

        if (!state.AI_PLAYER){
            state.AI_PLAYER = {
                rounds: [],
            };
        }

        if (state.AI_PLAYER.curXMLRequest){
            //state.AI_PLAYER.curXMLRequest.abort();
        }

        const newRusltListener = google.maps.event.addListener(state.GoogleMapsObj, "result page", ()=>{
            google.maps.event.removeListener(newRusltListener);
            showAIGuess_normalResultPage(curGuess);
        });

        if (!isDuelsGame() && state?.AI_PLAYER?.rounds[_round-1]?.state == 'Done'){
                        
            curGuess = state?.AI_PLAYER?.rounds[_round-1];

            setTimeout(()=>{
                // talkToAi gets called before the page is done loading.
                newAlert(`Retrieved saved information for round #${_round}!`, "check");
                getReadyForResultPage(curGuess);
            }, 1000);
            return;
        }

        if (!_canvas){
            _canvas = document.createElement('canvas');
            _canvas.id = "canvas";
            _canvas.setAttribute('width', "8192");
            _canvas.setAttribute('height', "4096");
            _canvas.style.position = 'absolute';
            _canvas.style.left = "-9999999px";
            document.body.appendChild(_canvas);
        }

        const canvas = _canvas; 
        let size = 512;
        let panos = [];
        let xmax = 0;
        let ymax = 0;
        let url = ``;
         
        newAlert('Started downloading panorama!');

        imageUrlToBase64(0,0);

        function imageUrlToBase64 (x, y) {
            let url = `https://streetviewpixels-pa.googleapis.com/v1/tile?cb_client=maps_sv.tactile&panoid=${panoId}&x=${x}&y=${y}&zoom=3&nbt=1&fover=2`;
            const ctx = document.getElementById("canvas").getContext("2d");

            const _waitingForPanoLoadMsg = setInterval(()=>{
                newAlert(`Still downloading panorama!`) 
            }, 10000);

            fetch(url)
                .then(response => {
                if (response.status != 200){
                    if (x == 0 ){
                       // alert('downloading images done', x, y);
                        ymax = y;
                        canvas.width = xmax * size;
                        canvas.height = ymax * size;
                        buildcanvas();
                        newAlert('Finished downloading panorama!', "check");
                        return;
                    }
                    xmax = Math.max(xmax, x);
                    setTimeout(()=> imageUrlToBase64(0,y+1), 100);
                    return;
                }
                return response.blob();
            })
            .then(blob => {
                return new Promise((onSuccess, onError) => {
                    try {
                        const reader = new FileReader();
                        reader.onload = function(){ onSuccess(this.result) };
                        reader.readAsDataURL(blob);
                    } catch(e) {
                        clearInterval(_waitingForPanoLoadMsg);
                        console.error("Error downloading pano image. Probably last image on row.");
                        // onError(e);
                    }
                });
            }).then(base64 => {
                clearInterval(_waitingForPanoLoadMsg);
                const img = new Image();
                img.onload = function(e){
                    ctx.drawImage(img, 0,0);
                    panos.push(img);
                    setTimeout(()=> imageUrlToBase64(x+1,y), 10);
                }
                img.onerror = function(e){
                    alert(e);
                }
                img.src = base64;
            });
        }

        async function buildcanvas(){
            const _canvas = document.getElementById("canvas");
            const ctx = document.getElementById("canvas").getContext("2d");
            let idx = 0;
            for(let y = 0; y < ymax; y++){
                for(let x = 0; x < xmax; x++){
                    ctx.drawImage(panos[idx++],x*size,y*size, size,size);
                }
            }

            let fileObj = dataURLtoFile(canvas.toDataURL("image/jpeg", 0.90),'placeholderFileName.jpeg');
            let imgAsUint8Array = new Uint8Array(await fileObj.arrayBuffer());

/* Header:
--dart-http-boundary-40EdV4lUXZS7aaGYOsL.CMNvbMnItzj1O_OlQIQq2FmshFJYxaf
content-type: image/jpeg
content-disposition: form-data; name="image"; filename="test image uk.jpeg"



*/
            let header = [45,45,100,97,114,116,45,104,116,116,112,45,98,111,117,110,100,97,114,121,45,52,48,69,100,86,52,108,85,88,90,83,55,97,97,71,89,79,115,76,46,67,77,78,118,98,77,110,73,116,122,106,49,79,95,79,108,81,73,81,113,50,70,109,115,104,70,74,89,120,97,102,13,10,99,111,110,116,101,110,116,45,116,121,112,101,58,32,105,109,97,103,101,47,106,112,101,103,13,10,99,111,110,116,101,110,116,45,100,105,115,112,111,115,105,116,105,111,110,58,32,102,111,114,109,45,100,97,116,97,59,32,110,97,109,101,61,34,105,109,97,103,101,34,59,32,102,105,108,101,110,97,109,101,61,34,116,101,115,116,32,105,109,97,103,101,32,117,107,46,106,112,101,103,34,13,10,13,10,255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1,0,1,0,0];

/* Footer:


--dart-http-boundary-40EdV4lUXZS7aaGYOsL.CMNvbMnItzj1O_OlQIQq2FmshFJYxaf--

*/

            let footer = [13,10,45,45,100,97,114,116,45,104,116,116,112,45,98,111,117,110,100,97,114,121,45,52,48,69,100,86,52,108,85,88,90,83,55,97,97,71,89,79,115,76,46,67,77,78,118,98,77,110,73,116,122,106,49,79,95,79,108,81,73,81,113,50,70,109,115,104,70,74,89,120,97,102,45,45,13,10];

            let res = header;

            for (let n = 20; n < imgAsUint8Array.length; n++){
                res.push(imgAsUint8Array[n]);
            }

            footer.forEach(num => res.push(num));

            sendRequestToAi(new Uint8Array(res), curGuess);
        }

        function dataURLtoFile(dataurl, filename) {
            var arr = dataurl.split(','),
                mime = arr[0].match(/:(.*?);/)[1],
                bstr = atob(arr[arr.length - 1]),
                n = bstr.length,
                u8arr = new Uint8Array(n);
            while(n--){
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new File([u8arr], filename, {type:mime});
        }
    }
    
    function sendRequestToAi(payLoad, curGuess){
        /* Mock response for testing */
        
      //   AIServerResponse({
      //       response: '{"message":" Country: Norway\\nExplanation: The photo was taken on a bridge in Norway. The bridge is surrounded by mountains and there is a river running underneath it. The photo was taken in the fall, as the leaves on the trees are turning brown.\\nCoordinates: 60.4739° N, 7.0112° E","sup_data":[]}'
      //      // response: '{"message":" Country: Norway\\nExplanation: The photo was taken on a bridge in Norway. The bridge is surrounded by mountains and there is a river running underneath it. The photo was taken in the fall, as the leaves on the trees are turning brown.\\nCoordinates: ","sup_data":[]}'
      //      // response: '{"message":" Country: \\nExplanation: The photo was taken on a bridge in Norway. The bridge is surrounded by mountains and there is a river running underneath it. The photo was taken in the fall, as the leaves on the trees are turning brown.\\nCoordinates: ","sup_data":[]}'
      //   }, curGuess);
      //   return;
        
        curGuess.state = "Sending XMLHttpRequest to AI server.";
            
        let xmlr = new XMLHttpRequest();

        state.AI_PLAYER.curXMLRequest = xmlr;
        
        xmlr.open("POST", "https://locate-image-7cs5mab6na-uc.a.run.app/");
        xmlr.setRequestHeader("content-type", 'multipart/form-data; boundary=dart-http-boundary-40EdV4lUXZS7aaGYOsL.CMNvbMnItzj1O_OlQIQq2FmshFJYxaf');
        xmlr.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {
                clearInterval(_interval);
                AIServerResponse(xmlr, curGuess); 
            }
        };
        
        newAlert(`Sending panorama to GeoSpy.ai's server!`);

        const _interval = setInterval(()=>{
           newAlert(`Still waiting on GeoSpy.ai for round #${curGuess.curRound}!`); 
        }, 10000);

        xmlr.send(payLoad);
    }

    async function AIServerResponse(XMLHttpRequestObj, curGuess){
        if (!state.inaGame) return;

        if (XMLHttpRequestObj.readyState == 0){
            alert('mission aborted');
            return;
        }

        //const resToJSON = {"code":5000,"error":"Method not allowed"};
        const resToJSON = JSON.parse(XMLHttpRequestObj.response);

        const errorRegExp_1 = new RegExp("There is not enough context in the photo to determine a location. Please try a more interesting photo", "is");

        if (resToJSON?.error || errorRegExp_1.test(resToJSON?.message)){
            handleBadResponse(resToJSON, curGuess);
            return;
        }

        const country = resToJSON?.message?.match(/^.*country:\s?([\u0020-\u009f\u00a1-\uFFFF]+).*/si);
        curGuess.country = country && country[1] && /\w+/.test(country[1])? country[1] : null;
        
        const coords = await getCoords(resToJSON, curGuess.country);

        curGuess.latLng = coords.latLng; 
         
        if (curGuess?.latLng?.lng > 0 && curGuess?.country && (nwCountries[curGuess?.country?.toLowerCase()] || swCountries[curGuess?.country?.toLowerCase()])){
                curGuess.latLngNeg = true;
                curGuess.latLng.lng = -curGuess.latLng.lng;        
        }

        if (curGuess?.latLng?.lat > 0 && curGuess?.country && swCountries[curGuess?.country?.toLowerCase()]){
                curGuess.latLngNeg = true;
                curGuess.latLng.lat = -curGuess.latLng.lat;        
        }

        curGuess._latLng = coords.latLng; 

        curGuess.countryLatLng = coords.countryLatLng;

        curGuess.json = resToJSON;

        curGuess.state = "Done";

        newAlert(`AI has returned an answer for round #${curGuess.curRound}!`, "check");

        getReadyForResultPage(curGuess);
    }
    
    function getReadyForResultPage(curGuess){
        const newRoundListener = google.maps.event.addListener(state.GoogleMapsObj, "new round", ()=>{
            google.maps.event.removeListener(newRoundListener);
            hideAIGuess(curGuess);
        });

        google.maps.event.trigger(state.GoogleMapsObj, "AI response finished", curGuess);
    }

    async function getCoords(resToJSON, country){
        const DMSReg =/\d+°\d+'\d*\.?\d*/g; 
        const DDReg = /.*?(-?\d+\.\d+).*?(-?\d+\.\d+).*$/is;

        // First check for degrees, minutes, seconds
        let latLng = convertDMStoDD(resToJSON?.message?.match(DMSReg));
         
        latLng = latLng == null  
                // Check for degrees.
                ? resToJSON?.message?.match(DDReg)
                : latLng;

        let countryLatLng = null;

        if (latLng && Array.isArray(latLng) && !isNaN(parseFloat(latLng[1])) && !isNaN(parseFloat(latLng[2]))){
            // Must be degrees array.
            latLng = { lat: parseFloat(latLng[1]), lng: parseFloat(latLng[2]) }; 
        } else if (!latLng?.lat && !latLng?.lng && country){
            // Find coords for the country if lat lng can't be found.
            latLng = null;
            const countryInfo = await fetch(`https://countryinfoapi.com/api/countries/name/${country}`).then( info => info.json());
            countryLatLng = countryInfo.latlng; 
            countryLatLng = { lat: parseFloat(countryLatLng[0]), lng: parseFloat(countryLatLng[1]) };
        }
        
        return { latLng , countryLatLng };
    }
    
    function handleBadResponse(resToJSON, curGuess){
        curGuess.json = {
            message: resToJSON?.error || resToJSON?.message || "Something happened with response from server.",
        };
        curGuess.badResponse = true;
        curGuess.points = 0;
        curGuess.latLng = bermudaTriangleCoords; 
        curGuess._latLng = bermudaTriangleCoords; 

        const newRoundListener = google.maps.event.addListener(state.GoogleMapsObj, "new round", ()=>{
            google.maps.event.removeListener(newRoundListener);
            hideAIGuess(curGuess);
        });

        curGuess.state = "Done";

        google.maps.event.trigger(state.GoogleMapsObj, "AI response finished", curGuess);

        newAlert(`AI has returned an answer for round #${curGuess.curRound}!`, false, "x");

        console.log("AI Didn't like image curGuess", curGuess);
    }

    function convertDMStoDD(latLng_array){
        // Degrees Minutes Seconds (DMS) (should be strings)
        // Decimal Degrees (DD)
        let latLng = latLng_array;
        const DMSReg = /([\d.]+)\°?([\d.]+)\'?([\d.]+)\"?/;
        if (Array.isArray(latLng) && latLng?.length === 2 && parseFloat(latLng[0]) && parseFloat(latLng[1])){
            // Convert degrees, minutes, seconds.
            let _lat = latLng[0];
            let _parts = _lat.match(DMSReg);
            
            if(parseFloat(_parts[1])){
                let deg = parseFloat(_parts[1]);
                let min = parseFloat(_parts[2] || "0") / 60;
                let sec = parseFloat(_parts[3] || "0") / 3600;
                _lat = deg + min + sec;
            }
            
            let _lng = latLng[1];
            _parts = _lng.match(DMSReg);

            if (parseFloat(_lat) && parseFloat(_parts[1])){
                let deg = parseFloat(_parts[1]);
                let min = parseFloat(_parts[2] || "0") / 60;
                let sec = parseFloat(_parts[3] || "0") / 3600;
                _lng = deg + min + sec;
            }
            
            if (parseFloat(_lng)){
                latLng = {lat: _lat, lng: _lng};
            } else {
                latLng = null;
            }
        }
        
        return latLng;
    }

    window.fetch = (function () {
        // Always updating game info everytime geoguessr makes a request.
        let _fetch = window.fetch;

        return async function (...args) {

            if (/geoguessr.com.api.v3.(challenge|game)/i.test(args[0]) || /*duels*/  /api.duels.*reconnect/i.test(args[0])) {
                // Always updating game info everytime geoguessr makes a request.

                let v3APIRes = await _fetch.apply(window, args);

                let resJSON = await v3APIRes.clone().json();
                
                if (!resJSON?.error)
                    state.gameInfo = resJSON;

                return new Promise((res) => {
                    res(v3APIRes);
                });
            }
            
            try{
                return _fetch.apply(window, args);
            } catch(e){}
        };
    })();
    
    let ar = [];
    function newAlert(msg, check, x){
        const _check = `<span style="color: green;">&#10004;</span>`;
        const _x = `<span style="color: red;">&#10006;</span>`;

        const body = document.createElement('div');
        body.style.cssText = `position: absolute; left: -22em;  padding: 10px; transition: 1s ease-in-out all; background-color: white; font-size: 18px;font-family: var(--default-font); z-index: 999999;`;
        body.innerHTML = `<div>${check? _check: x? _x:''} ${msg}</div>` ;

        document.body.appendChild(body);

        ar.push(body);

        setTimeout(()=>{

            let p = 0;
            ar.forEach((el, idx)=>{
                if (el._removed) return;
                el.style.top = (p + 1)* 3 + 'em';
                el.style.left = "2em";
                p++;
            });

            setTimeout(()=>{
                    body.style.top ="-10em";
                    body.style.opacity = '0';
                    body._removed = true;
                    let p = 0;
                    ar.forEach((el)=>{
                        if (el._removed) return;
                        el.style.top = (p + 1)* 3 + 'em';
                        p++;
                    });
                    setTimeout(()=>{ body.remove(); }, 1200);
                }, 4000);
        }, 100);
       }

       function shootTarget(start, target){
            const dist1 = distanceInPx(state.GoogleMapsObj, start, target);
            if (dist1 < 300) return;

            const dist = window.innerWidth;

            const lineSymbol = {
                //path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, // "M 0,-1 0,1",
                path: "m25,1 6,17h18l-14,11 5,17-15-10-15,10 5-17-14-11h18z",
                strokeOpacity: 1,
                fillOpacity: 1,
                scale: 0.25,
            };
            
            for (let n = 0; n < 3; n++){
                let p = 0;

                setTimeout(()=>{
                    let offset = 0;

                    const line = new google.maps.Polyline({
                            path: [start, target],
                            strokeColor: "#fb443b", // "#fb443b" Red marker color
                            fillColor: "red",
                            strokeOpacity: 0,
                            fillOpacity: 1,
                            icons: [
                                {
                                    icon: lineSymbol,
                                    offset: offset + "px",
                                    repeat: dist * 2 + "px",
                                    fillColor: "red",
                                },
                            ],
                            map: state.GoogleMapsObj,
                        });

                    function frames(){
                        if (offset > dist) { 
                            line?.setMap(null);
                            return;
                        }

                        offset += 10;

                        const icons = line.get('icons');
                        icons[0].offset = offset + "px";
                        line.set('icons', icons);
                        requestAnimationFrame(frames);
                    }
                    frames();
                }, n * 500);
            }
            return { 
                destroy: ()=> {
                    return;
                    line.setMap(null); 
                    clearInterval(inter);
                }
            };
       }

    async function sendLocation(location, round, points, deleteThis){
        let confiRm = confirm(`Send round #${round}, with ${points} pts, to map-making.app?`);
        if (!confiRm) return;

        // TODO: Remove number when uploading to github.
        return importLocations( g_apikey, [location], (deleteThis? [deleteThis] : []));
    }

    //
    // TODO remove everything below this line when uploading to github
    //
{
}
    // To this line
})();

//const westernCountries = {};
//const westernCountriesArray = ["canada", "chile", "mexico", "usa", "united states", "guatemala", "panama", "colombia", "argentina", "brazil", "bolivia", "ecuador", "ireland", "portugal", "senegal", "costa rica", "venezuela", "peru", "suriname", "puerto rico", "dominican republic", "uruguay","paraguay", "guyana", "french guiana", "nicaragua", "honduras",
//                                "el salvador", "belize", "curaçao", "aruba","virgin islands", "british virgin islands", "bermuda" ];
//westernCountriesArray.forEach(country => westernCountries[country] = true); 

// For fixing common AI response error. Sometimes it doesn't put a negative sign in front of coordinates.
const nwCountries = {};
const nw = ["liberia", "caymen islands","haiti","the bahamas","wales","northern ireland","bonaire","jamaica","cuba","canada","mexico","usa","united states","guatemala","panama","colombia","ireland","portugal","senegal","costa rica","venezuela","suriname","puerto rico","dominican republic","guyana","french guiana","nicaragua","honduras","el salvador","belize","curaçao","aruba","virgin islands","british virgin islands","bermuda"];
nw.forEach(country => nwCountries[country] = true); 
const swCountries = {};
const sw =  ["chile","argentina","brazil","bolivia","ecuador","peru","uruguay","paraguay"];
sw.forEach(country => swCountries[country] = true); 

    document.head.insertAdjacentHTML(
    // Append style sheet for this script. 
    "beforeend",
    `<style>
    div.gm-style-iw.gm-style-iw-c {
        padding-right: 12px !important;
        padding-bottom: 12px !important;
    }
    
    div.gm-style-iw.gm-style-iw-c:focus-visible {
        outline: none;
    }

    div.gm-style-iw.gm-style-iw-c div.gm-style-iw-d {
        overflow: unset !important;
    }

    #geospy_response a>span:hover {
        color: green;
    }
    </style>`);


function _distance(a, b){
    return distance(a.lat, a.lng, b.lat, b.lng);
}

function distance(lat1, lon1, lat2, lon2) {
    // from unity script for testing purposes
    var p = 0.017453292519943295; // Math.PI / 180
    var c = Math.cos;
    var a = 0.5 - c((lat2 - lat1) * p)/2 +
        c(lat1 * p) * c(lat2 * p) *
        (1 - c((lon2 - lon1) * p))/2;

    return 1000 * 12742 * Math.asin(Math.sqrt(a)); // 2 * R; R = 6371 km
}

function distanceInPx(map, marker1, marker2) {
    var p1 = map.getProjection().fromLatLngToPoint(marker1);
    var p2 = map.getProjection().fromLatLngToPoint(marker2);

    var pixelSize = Math.pow(2, -map.getZoom());

    var d = Math.sqrt((p1.x-p2.x)*(p1.x-p2.x) + (p1.y-p2.y)*(p1.y-p2.y))/pixelSize;

    return d;
}


async function mmaFetch(url, options = {}) {
	const response = await fetch(new URL(url, 'https://map-making.app'), {
		...options,
		headers: {
			accept: 'application/json',
			authorization: `API ${MAP_MAKING_API_KEY.trim()}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			edits: [{
				action: { type: 4 },
				create: locations,
				remove: []
			}]
		})
	});

	if (!response.ok) {
		let message = 'Unknown error';
		try {
			const res = await response.json();
			if (res.message) {
				message = res.message;
			}
		} catch {
		}
		alert(`An error occurred while trying to connect to Map Making App. ${message}`);
		throw Object.assign(new Error(message), { response });
	}
	return response;
}

async function importLocations(mapId, addLocs = [], removeLocs = []) {
	const response = await fetch(`https://map-making.app/api/maps/${mapId}/locations`, {
		method: 'post',
		headers: {
			accept: 'application/json',
			authorization: `API ${MAP_MAKING_API_KEY.trim()}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			edits: [{
				action: { type: 4 }, // 4
				create: addLocs,
				remove: removeLocs 
			}]
		})
	});

	if (!response.ok) {
		let message = 'Unknown error';
		try {
			const res = await response.json();
			if (res.message) {
				message = res.message;
			}
		} catch {
		}
		alert(`An error occurred while trying to connect to Map Making App. ${message}`);
		throw Object.assign(new Error(message), { response });
	}

	return await response.json();

//	const response = await mmaFetch(`/api/maps/${mapId}/locations`, {
//		method: 'post',
//		headers: {
//			'content-type': 'application/json'
//		},
//		body: JSON.stringify({
//			edits: [{
//				action: { type: 4 },
//				create: locations,
//				remove: []
//			}]
//		})
//	});
//	await response.json();
}

//console.log(getMaps());
