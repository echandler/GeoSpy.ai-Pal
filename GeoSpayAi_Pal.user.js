// @name         GeoSpy.ai Pal 
// @description  Play GeoGuessr with an AI pal! 
// @namespace    AI scripts 
// @version      0.0.5
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
    const state = {_id: 0};
    const bermudaTriangleCoords = { lat: 24.960182, lng: -71.022406 }; 
    const onMapLoadCallBacks = [];
    let duelsLastRoundNum = null;
    let _canvas = null;

    window.showAltsArray = [];

    const sesh = sessionStorage['aipal']? JSON.parse(sessionStorage['aipal']): null;
    if (sesh){
        state.AI_PLAYER = sesh.AI_PLAYER;
    }

    function overrideOnLoad(googleScript, observer, overrider) {
        // From unity script.
        const oldOnload = googleScript.onload
        googleScript.onload = (event) => {
            const google = window.google
            if (google) {
                observer.disconnect()
                overrider(google)
            }
            if (oldOnload) {
                oldOnload.call(googleScript, event)
            }
        }
    }

    function grabGoogleScript(mutations) {
        // From unity script.
        for (const mutation of mutations) {
            for (const newNode of mutation.addedNodes) {
                const asScript = newNode
                if (asScript && asScript.src && asScript.src.startsWith('https://maps.googleapis.com/')) {
                    //asScript.src = "https://maps.googleapis.com/maps/api/js?key=AIzaSyDqRTXlnHXELLKn7645Q1L_5oc4CswKZK4&v=3&libraries=places,drawing&language=ja&region=JP"
                    return asScript
                }
            }
        }
        return null
    }

    function injecterCallback(overrider) {
        // From unity script.
        new MutationObserver((mutations, observer) => {
            const googleScript = grabGoogleScript(mutations)
            if (googleScript) {
                overrideOnLoad(googleScript, observer, overrider)
            }
        }).observe(document.documentElement, { childList: true, subtree: true })
        }

    function injecter(overrider) {
        // From unity script.
        document.documentElement
            ? injecterCallback(overrider)
            : alert("Script didn't load, refresh to try loading the script");
    }

    window.addEventListener('DOMContentLoaded', (event) => {
        injecter(() => {
            // From unity script.

            const svService = new google.maps.StreetViewService();
            google.maps.StreetViewPanorama = class extends google.maps.StreetViewPanorama {
                constructor(...args) {
                    super(...args);

                    state.svPlayer = this;

                    this.addListener('position_changed', (e) => {
                        if (!state.curPanoId){
                            if (state.onResultPage) return;

                            state.curPanoId = this.getPano();

                            if (!state.curPanoId || state.curPanoId.length !== 22){
                                newAlert("Can't get pano id. It's not going to work for this round.");
                                return;
                            }
                            state.curLatLng = this.position.toJSON();

                            state.needToTalkToAi = false;
                            state.notInAGame = false;

                            talkToAi(state.curPanoId);
                        }
                        console.log(state)

                    });
                }
            };

            google.maps.Map = class extends google.maps.Map {
                constructor(...args) {
                    super(...args);

                    state.GoogleMapsObj = this;

                    setListeners();

                    onMapLoadCallBacks.forEach(fn => fn()); 
                    onMapLoadCallBacks.length = 0;

                    google.maps.event.trigger(this, "new map", this);
           
                    this.addListener('click', (e) => {
                        state.playerMapClickPos = e.latLng.toJSON();

                    });
                    
                }
            };
        });// End of injector().
    });// End of DOMContentLoaded listener.


    let mainObserver = new MutationObserver((mutations) => {
        // Started making this observer with good intentions!
        // I just don't know the best way of checking for new rounds.

        mutations.forEach((mutation) => {

            if (mutation.removedNodes) {
                for (let m of mutation.removedNodes) {
                    if (!m.classList) break;

                    const classListString = m.classList.toString();
                    console.log(classListString);
                    const resultLayout = m.classList.length < 3 && /result/.test(classListString); 
                    if (resultLayout){
                        //leaving result page.
                        state.onResultPage = false;
                        google.maps.event.trigger(state.GoogleMapsObj, "leaving result page");
                    }
                    if (m.classList.length < 3 && /in-game_background/i.test(classListString)){
                        // Possibly starting new game.
                        //alert("added" + m.getAttribute('data-qa'))
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

                   // const isDuelsResulst = /overlay_backdrop/.test(classListString);
                    
                   // if (isDuelsResulst){
                   //     //alert("leaving is duels result")
                   // }
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
                                }, 2000);

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
                        newAlert("Are you being naughty?") 
                        //alert('on party')
                    }
                    
                    if (inDuelsGame){
                        try {
                            if (!window?.google){
                                const _timer = setTimeout(()=>{
                                    newAlert("Couldn't find google maps object. Contact author of script if error persists.");
                                }, 2000);

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
                        google.maps.event.trigger(state.GoogleMapsObj, "result page");
                        return;
                    }
                    
                    const showingDuelsTimer = /clock-timer/i.test(classListString);
                    if (showingDuelsTimer){
                        google.maps.event.trigger(state.GoogleMapsObj, "showing duels timer");
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
        state.listenersSet = true;
        google.maps.event.addListener(state.GoogleMapsObj, "new round", newRoundFn);
        google.maps.event.addListener(state.GoogleMapsObj, "end game", endOfGame);
        google.maps.event.addListener(state.GoogleMapsObj, "result page", onResultPageFn);
        google.maps.event.addListener(state.GoogleMapsObj, "AI response finished", updateAICurRound );
        google.maps.event.addListener(state.GoogleMapsObj, "AI response finished", waitToUpdateDuelsGame );
        google.maps.event.addListener(state.GoogleMapsObj, "showing duels timer", updateDuelsTimer );
        google.maps.event.addListener(state.GoogleMapsObj, "duels game finished", duelsGameFinished );
        google.maps.event.addListener(state.GoogleMapsObj, "standard game final score page", showAIGuess_standard_finalResultsPage );
        google.maps.event.addListener(state.GoogleMapsObj, "challenge game final score page", ()=> setTimeout(showAIGuess_challenge_finalResultsPage, 1000) );
    }
    
    function duelsGameFinished(){
        // Reset game number for next game.
        duelsLastRoundNum = null;

        setTimeout(()=>{
            document.body.querySelectorAll('a').forEach(async btn => {
                    if (!/continue/i.test(btn.innerText)) return;
//                    setTimeout(() => btn.click(), 3000);
                });
        }, 3000);
    }

    function updateDuelsTimer(curGuess){
    // TODO: Do something here.
    }

    function waitToUpdateDuelsGame(curGuess){
        if (!isDuelsGame()) return;

        if (state.gameInfo.currentRoundNumber != curGuess.curRound) {
            newAlert("Couldn't guess in time.");
            return;
        }

        let stillOnResultsPage = document.body.querySelector('div[class*="overlay_backdrop"]');
        if (stillOnResultsPage){
            setTimeout(()=> waitToUpdateDuelsGame(curGuess), 1000);
            newAlert("still on results page");
            return;
        } 
        
        try{
            // Show marker, but it will error out when it tries to find score nodes for standard game.
            // I don't want to make a marker function just for duals...yet.
            const listener2 = google.maps.event.addListener(state.GoogleMapsObj, "duals new round", ()=>{
                google.maps.event.trigger(state.GoogleMapsObj, "remove all markers");
                google.maps.event.removeListener(listener2);
            });

            state.GoogleMapsObj.setZoom(3);
            state.GoogleMapsObj.setCenter(curGuess.latLng || curGuess.countryLatLng);

            showAIGuess_normalResultPage(curGuess, "ignore result page state", "don't change bounds");
        } catch(e){}

        if (document.querySelector('[class*="clock-timer"]')){
            updateDuelsGame(curGuess);
            return;
        }

        const listener1 = google.maps.event.addListener(state.GoogleMapsObj, "showing duels timer", ()=>{
            clearTimeout(_timer);
            google.maps.event.removeListener(listener1);
            setTimeout( ()=> updateDuelsGame(curGuess), 3000  + (Math.random() * 5000));
        });

        const randomTime =4000 + (Math.random() * 10000); 

        newAlert(`Will make guess in ${(randomTime/1000).toFixed(1)} seconds!`);

        const _timer = setTimeout(()=>{
            // Give some "realism" by not making the guess immediately.
            google.maps.event.removeListener(listener1);
            updateDuelsGame(curGuess);
        }, randomTime);
    }
    
    function updateDuelsGame(curGuess){
        if (!isDuelsGame()) return

        if (state.gameInfo.currentRoundNumber === duelsLastRoundNum || duelsLastRoundNum === null){
            state.gameInfo.currentRoundNumber++;
            duelsLastRoundNum = state.gameInfo.currentRoundNumber; 
        } else {
            alert("Something happened: wrong round number. Can't make guess.")
            return;
        }

        const message = curGuess?.json?.message;

        if (!curGuess.latLng && !curGuess.countryLatLng){
            newAlert("Couldn't find coordinates in response.");
            if (message){
                newAlert("Check Dev tools console for AI response.");
            } 
            return;
        } else {
            placeMarkerOnMapAndMakeGuess(curGuess.latLng || curGuess.countryLatLng, curGuess.curRound);
        }

        if (message) {
            console.log("AI RESPONSE:", curGuess.json.message);
        }
    }
    
    async function placeMarkerOnMapAndMakeGuess(latLng, roundNumber){
        let gameId = location.pathname.split("/")[2];
       
        if (!roundNumber){
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
            "body": JSON.stringify({ "lat": latLng.lat, "lng": latLng.lng, "roundNumber": roundNumber}), 
            "method": "POST",
            "mode": "cors",
            "credentials": "include"
        });
    }

    function showAIGuess_challenge_finalResultsPage(){
        const table = document.querySelector(`div[class*="results_table"]`);
        const firstRow = table.children[2];
        const AI_row = firstRow.cloneNode(true);
        const AI_userLink = AI_row.querySelector('div[class*="userLink"]'); 
        const AI_nick = AI_row.querySelector(`div[class*="user-nick_nick_"]`);        
        const AI_avatar = AI_row.querySelector(`div[class*="avatar"]`);        
        const AI_resultsPos = AI_row.querySelector(`span[class*="results_position"]`);
        const AI_resultsScores= AI_row.querySelectorAll(`div[class*="_score_"]`);
        const AI_scoreDetails = AI_row.querySelectorAll(`div[class*="scoreDetails"]`);
        
        const selectedRow = [...document.querySelector(`div[class*="results_selected"]`).classList];

        AI_row.addEventListener('click', ()=>{
           if (/selected/i.test(AI_row.classList.toString())){
                AI_row.classList = [];
                selectedRow.forEach(el =>{
                    if (/selected/i.test(el))return;
                    AI_row.classList.add(el);
                })
                google.maps.event.trigger(state.GoogleMapsObj, "remove all markers");
           } else{
               AI_row.remove();
               showAIGuess_challenge_finalResultsPage();
           } 
           
        });

        selectedRow.forEach(el =>{
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
        
        const totals = state.AI_PLAYER.rounds.reduce((acc, curval, idx, array) => {
            if (!curval) {
                return acc;
            }
            return [acc[0] + curval.points, acc[1] + curval.distance];
        }, [0, 0]);
                
        AI_scoreDetails.forEach((el, idx) =>{
            el.innerText = "?"; 

            if (idx === 5){
                // Total element
                const unit = /miles/i.test(el.innerText);

                const converted = convertDistanceTo(totals[1], unit? "miles": "km");

                el.innerText = `${Math.round(converted.distance).toLocaleString()} ${converted.unit}`;

            } else if (state.AI_PLAYER.rounds[idx]){
                const unit = /miles/i.test(el.innerText);
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
      
        table.insertBefore(AI_row, firstRow);
        
        AI_row.addEventListener('click', ()=>{
           // TODO: what was this for? 
        });

        google.maps.event.trigger(state.GoogleMapsObj, "remove all markers");

        state.AI_PLAYER.rounds.forEach( (el, idx) => makeFinalResultsPageMarkers(el, idx, dragEndCb.bind(null, el)));

        function dragEndCb(el){
            AI_row.remove();

            el.latLngNeg = false;

            google.maps.event.trigger(state.GoogleMapsObj, `remove all round markers`);

            updateAICurRound(el, el.marker.getPosition().toJSON());

            showAIGuess_challenge_finalResultsPage();
        }
    } // End showAIGuess_challenge_finalResultsPage

    function showAIGuess_standard_finalResultsPage(){
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
        
        AI_layout.childNodes.forEach( (el, idx) => {
            const _id = state._id++;

            let score = "?";
            let distance = "?";

            if(state.AI_PLAYER.rounds[idx]){
                let round =state.AI_PLAYER.rounds[idx]; 
                score = round.points;
                distance = round.distance;

            } else if (/total/i.test(el.innerHTML)){
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
            const unit = /miles/.test(roundInfoEL.innerHTML)? "miles": "km";

            if (distance != "?"){
                distance = convertDistanceTo(distance, unit);
                distance.distance = parseFloat(distance.distance.toFixed(2)).toLocaleString();
            }

            roundInfoEL.innerHTML = `${distance.distance} ${distance.unit}`;
        });

        google.maps.event.trigger(state.GoogleMapsObj, "remove all markers");
        state.AI_PLAYER.rounds.forEach( (el, idx) => makeFinalResultsPageMarkers(el, idx, dragEndCb.bind(null, el)));

        function dragEndCb(el){
            AI_header.remove();
            AI_layout.remove();

            el.latLngNeg = false;

            google.maps.event.trigger(state.GoogleMapsObj, `remove final round markers`);

            updateAICurRound(el, el.marker.getPosition().toJSON());

            showAIGuess_standard_finalResultsPage();
        }

        layout.parentElement.appendChild(AI_layout);
        layout.parentElement.appendChild(AI_header);

        setTimeout(()=>{
            // So that it doesn't trip up the observer and go into an infinite loop.
            AI_layout.className = AI_layout._classListString;
            AI_layout.style.visibility = 'visible';
        }, 100);
    } // End showAIGuess_standard_finalResultsPage
    
    function makeFinalResultsPageMarkers (round, idx, dragEndCb) { 
        if (!round) return;

        const _id = state._id++;

        let markerPos = bermudaTriangleCoords; 
        let infoWindowContent = '';

        if (!round?.latLng && !round?.countryLatLng){
            newAlert(`Could not find country name or coordinates for round ${round.curRound}`)
        } else {
            markerPos = round.latLng || round.countryLatLng;
        }

        const marker = new google.maps.Marker({
            position: markerPos,
            label: {
                text: `${idx+1}`,
                color: '#fff',
                fontSize: '19px',
                fontWeight: 'bold',
                fontFamily: 'var(--default-font)'
            } , 
            draggable: true,
            map: state.GoogleMapsObj,
        });

        round.marker = marker;

        const infoWindow = new google.maps.InfoWindow({
            map: state.GoogleMapsObj,
            content: makeInfoWindowContent(round, drag, dragEndCb, _id),
            disableAutoPan: true,
        });
        
        let infoWindowOpened = false;

        marker.addListener('click', () => {
            infoWindowOpened = !infoWindowOpened;
            infoWindowOpened ?  infoWindow.open({anchor: marker})
                                : infoWindow.close();
        });

        google.maps.event.addListener(marker, 'drag', drag);
        
        function drag(e) {
            try{
                if(document.getElementById("lat"+_id)) return;
                document.getElementById("lat"+_id).innerText = marker.getPosition().lat().toFixed(6);
                document.getElementById("lng"+_id).innerText = marker.getPosition().lng().toFixed(6);
            } catch(e){
                // Infowindow was closed so elemets were not in DOM.
            }
        }

        google.maps.event.addListener(marker, 'dragend', function() {
            //updateAICurRound(state.AI_PLAYER.rounds[idx], marker.getPosition().toJSON());
            dragEndCb();
        });

        const markerListener1 = google.maps.event.addListener(state.GoogleMapsObj, 'remove final round markers', ()=>{
            google.maps.event.removeListener(markerListener1);
            marker.setMap(null);
        });

        const markerListener2 = google.maps.event.addListener(state.GoogleMapsObj, 'new round', ()=>{
            google.maps.event.removeListener(markerListener2);
            marker.setMap(null);
        });

        const markerListener3 = google.maps.event.addListener(state.GoogleMapsObj, 'end game', ()=>{
            google.maps.event.removeListener(markerListener3);
            marker.setMap(null);
        });

        const markerListener4 = google.maps.event.addListener(state.GoogleMapsObj, "remove all markers", () => {
            google.maps.event.removeListener(markerListener4); 
            marker.setMap(null);
        });
    }

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
        state.notInAGame = true;
    }

    async function onResultPageFn(){
        //alert('new result page') 
        state.needToTalkToAi = true;     
        state.curPanoId = null; 
        state.curLatLng = null; 
    }
    
    function showAIGuess_normalResultPage(curGuess, ignoreResultPageState, dontChangeBounds){
        const _id = state._id++;

       if (!ignoreResultPageState && !state.onResultPage) return;

       if (!curGuess){
           newAlert("Can't find round");
           return;
       }

       if (curGuess.state != "Done" && !curGuess.savedRound){
            const listener = google.maps.event.addListener(state.GoogleMapsObj, "AI response finished", function(){
                google.maps.event.removeListener(listener);
                showAIGuess_normalResultPage(curGuess);
            });
            return;
        }
        
        let latLng = curGuess.latLng || curGuess.countryLatLng;
        if (!latLng || isNaN(latLng.lat)|| isNaN(latLng.lng)){
            // TODO EC: Change coords to Bermuda triangle?
            latLng = bermudaTriangleCoords;
        }

        if (curGuess.marker){
            curGuess.marker.setMap(null);
        }

        curGuess.marker = new google.maps.Marker({
            position: latLng,
            map: state.GoogleMapsObj,
            draggable: true,
        });
        
        const _timeout = setTimeout(()=>{
            infoWindow.close();
            infoWindowOpened = false;
        }, 5000);
        

        const infoWindow = new google.maps.InfoWindow({
            map: state.GoogleMapsObj,
            content: makeInfoWindowContent(curGuess, drag, dragEnd, _id), 
            disableAutoPan: true,
        });

        let infoWindowOpened = true;

        infoWindow.open({anchor: curGuess.marker});

        if (!dontChangeBounds){
            const _bounds = new google.maps.LatLngBounds();
            _bounds.extend(curGuess.marker.getPosition());
            _bounds.extend(curGuess.svPos);
            if (state.playerMapClickPos) _bounds.extend(state.playerMapClickPos);

            setTimeout(()=>{
                // Don't want battle geoguessr's animation.
                state.GoogleMapsObj.fitBounds(_bounds);
            }, 1000);

        }

        curGuess.marker.addListener('click', () => {
            clearTimeout(_timeout);

            infoWindowOpened = !infoWindowOpened;

            infoWindowOpened ?  infoWindow.open({anchor: curGuess.marker})
                                : infoWindow.close();
        });

        google.maps.event.addListener(curGuess.marker, 'drag', drag);
        
        function drag(e) {
            try{
                // infowindow might be closed.
                clearTimeout(_timeout);
                const lat = curGuess.marker.getPosition().lat().toFixed(6);
                const lng = curGuess.marker.getPosition().lng().toFixed(6);
                document.getElementById("lat"+_id).innerText = lat;
                document.getElementById("lng"+_id).innerText = lng;
                document.getElementById("googMapLink"+_id).href =`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`; 
            } catch (e){}
        };

        google.maps.event.addListener(curGuess.marker, 'dragend', dragEnd);

        function dragEnd(e) {
            const pos = curGuess.marker.getPosition().toJSON();

            updateAICurRound(curGuess, pos);
            
             curGuess.latLngNeg = false;
             showAIGuess_normalResultPage(curGuess, "ignore result page state", "dont change bounds")
        };
        
        const markerListener2 = google.maps.event.addListener(state.GoogleMapsObj, "end game", () => {
            google.maps.event.removeListener(markerListener2); 
            curGuess.marker.setMap(null);
        });

        const markerListener3 = google.maps.event.addListener(state.GoogleMapsObj, "remove all markers", () => {
            google.maps.event.removeListener(markerListener3); 
            curGuess.marker.setMap(null);
        });

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

        AI_scoreNode.children[0].firstChild.innerHTML = curGuess.points.toLocaleString();
        AI_scoreNode.style.textShadow = `0 .25rem 0 #5fbf2e, .125rem .125rem .5rem #8fe945, 0 -.25rem .5rem #3dff51, -.25rem .5rem .5rem #51fe19, 0 .375rem 2rem #45e1e9, 0 0 0 #4562e9, 0 0 1.5rem #4550e9, .25rem .25rem 1rem #3c19fe`;
    
        const unit = /miles/i.test(distanceNode.innerText)? "miles": "km";
        let distance = convertDistanceTo(curGuess.distance, unit);
        distance.distance = Math.round(parseFloat(distance.distance.toFixed(2))).toLocaleString();

        AI_distanceNode.children[0].firstChild.innerHTML = distance.distance; 
        AI_distanceNode.children[0].style.textShadow = AI_scoreNode.style.textShadow;// Distance text node.
        AI_distanceNode.children[1].firstChild.style.textShadow = AI_scoreNode.style.textShadow;// Units (miles/kilometers) text node.
        AI_distanceNode.children[1].firstChild.innerHTML = distance.unit;
    }
    
    function makeInfoWindowContent(curGuess, drag, dragEnd, _id){
        let latLng = curGuess.latLng || curGuess.countryLatLng;
        if (!latLng || isNaN(latLng.lat)|| isNaN(latLng.lng)){
            // TODO EC: Change coords to Bermuda triangle?
            latLng = bermudaTriangleCoords;
        }
        
        const AIMsg = curGuess.json.message.replace(/^\s*/, "");

        window.showAltsArray[curGuess.curRound] = (latLng, _id)=>{
            const el = document.getElementById('showAlts'+_id);
            el.innerHTML = '';
            el.title = "These coordinates could be what you want,\nclick on one to move the marker there.\nSometimes the AI forgets a '-' sign. 9_9";
            const anchor1 = document.createElement('a');
            anchor1.href = "#";
            anchor1.innerHTML = `<span style="text-decoration:underline">${Math.abs(latLng.lat).toFixed(5)}, ${Math.abs(latLng.lng).toFixed(5)}<span> | `;
            anchor1.onclick = (e)=> {
                e.preventDefault();
                curGuess.marker.setPosition({lat: Math.abs(latLng.lat), lng: Math.abs(latLng.lng) });
                drag(); dragEnd();
            };
            el.appendChild(anchor1);
            const anchor2 = document.createElement('a');
            anchor2.href = "#";
            anchor2.innerHTML = `<span style="text-decoration:underline">${(-Math.abs(latLng.lat)).toFixed(5)}, ${Math.abs(latLng.lng).toFixed(5)}<span> | `;
            anchor2.onclick = (e)=> {
                e.preventDefault();
                curGuess.marker.setPosition({lat: (-Math.abs(latLng.lat)), lng: Math.abs(latLng.lng) });
                drag(); dragEnd();
            };
            el.appendChild(anchor2);
            const anchor3 = document.createElement('a');
            anchor3.href = "#";
            anchor3.innerHTML = `<span style="text-decoration:underline">${Math.abs(latLng.lat).toFixed(5)}, ${(-Math.abs(latLng.lng)).toFixed(5)}<span>`;
            anchor3.onclick = (e)=> {
                e.preventDefault();
                curGuess.marker.setPosition({lat: Math.abs(latLng.lat), lng:(-Math.abs(latLng.lng)) });
                drag(); dragEnd();
            };
            el.appendChild(anchor3);
        } 

        const neg = curGuess.latLngNeg;
        
        let _latLng = curGuess._latLng;
        let isBermuda = false;
        if (!_latLng || isNaN(_latLng.lat)|| isNaN(_latLng.lng)){
            // TODO EC: Change coords to Bermuda triangle?

            _latLng = curGuess.countryLatLng;

            if (!_latLng){
                // No latlng or countrylatlng.
                _latLng = bermudaTriangleCoords;
                isBermuda = true;
            }
        }

        // Standard game infowindow content
        const infoWindowContent = `<div style="color:#111;">
                            Response from GeoSpy.ai Pal:
                            <pre style="max-width: 30em; background-color: #eee; overflow-x: scroll; 
                                        padding: 5px; scrollbar-color: grey white; 
                                        scrollbar-width: thin;">${AIMsg}</pre>
                            Coordinates for calculating points: 
                                <span onclick="showAltsArray[${curGuess.curRound}]({lat:${_latLng.lat}, lng:${_latLng.lng}}, ${_id});" title="**Click for addition coordinate options** \nIf the coord is green: the longitude was made negative to address a common \nerror with the AI response and could be wrong." >
                                    <span id="lat${_id}">${latLng.lat.toFixed(6)}</span>, <span style="color:${neg && "green"}" id="lng${_id}">${latLng.lng.toFixed(6)}</span>
                                </span>
                                ${isBermuda? `<div style="color: green">Could not find country name or coordinates in response.</div>`: "" }
                                <div id="showAlts${_id}"></div>
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
            newAlert("Google Geometry not available, switching to less accurate method.")
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

        curGuess.points = points; 
        curGuess.distance = guessDistance;

        state.AI_PLAYER.rounds[curGuess.curRound-1] = curGuess;

        saveRounds();

        google.maps.event.trigger(state.GoogleMapsObj, "updateAICurRound", state.AI_PLAYER.rounds[curGuess.curRound-1] );
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
            };
        });
        
        sessionStorage["aipal"] = JSON.stringify({AI_PLAYER: {rounds: rounds}});
    }
    
    function isDuelsGame(){
        return /duels/.test(location.href);
    }

    async function talkToAi(panoId){

        if (!state?.GoogleMapsObj) {
            setTimeout(()=>{
                talkToAi(panoId);
            }, 100);
            return;
        }
        
        const _round = state.gameInfo.currentRoundNumber || state.gameInfo.round;

        let curGuess = { 
            state: "Downloading Panorama", 
            svPos: state.svPlayer.position.toJSON(), 
            curRound : _round? _round: null, 
            curMapId : getMapId(),
        }; 

        if (!state.AI_PLAYER){
            state.AI_PLAYER = {
                rounds: [],
            };
        }

        if (state.AI_PLAYER.curXMLRequest){
            //state.AI_PLAYER.curXMLRequest.abort();
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

        const newRusltListener = google.maps.event.addListener(state.GoogleMapsObj, "result page", ()=>{
            google.maps.event.removeListener(newRusltListener);
            showAIGuess_normalResultPage(curGuess);
        });

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
                        newAlert('Finished downloading panorama!');
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
                        const reader = new FileReader() ;
                        reader.onload = function(){ onSuccess(this.result) } ;
                        reader.readAsDataURL(blob) ;
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
        
  //       AIServerResponse({
  //           response: '{"message":" Country: Norway\\nExplanation: The photo was taken on a bridge in Norway. The bridge is surrounded by mountains and there is a river running underneath it. The photo was taken in the fall, as the leaves on the trees are turning brown.\\nCoordinates: 60.4739° N, 7.0112° E","sup_data":[]}'
  //          // response: '{"message":" Country: Norway\\nExplanation: The photo was taken on a bridge in Norway. The bridge is surrounded by mountains and there is a river running underneath it. The photo was taken in the fall, as the leaves on the trees are turning brown.\\nCoordinates: ","sup_data":[]}'
  //          // response: '{"message":" Country: \\nExplanation: The photo was taken on a bridge in Norway. The bridge is surrounded by mountains and there is a river running underneath it. The photo was taken in the fall, as the leaves on the trees are turning brown.\\nCoordinates: ","sup_data":[]}'
  //       }, curGuess);
  //       return;
        
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
           newAlert('Still waiting on GeoSpy.ai! ') 
        }, 10000);

        xmlr.send(payLoad);
    }

    async function AIServerResponse(XMLHttpRequestObj, curGuess){
        if (state.notInAGame) return;
        if (XMLHttpRequestObj.readyState == 0){
            alert('mission aborted');
            return;
        }

        const resToJSON = JSON.parse(XMLHttpRequestObj.response);

        console.log(curGuess.curRound, resToJSON.message);

        const error1 = new RegExp("There is not enough context in the photo to determine a location. Please try a more interesting photo", "is");

        if (resToJSON?.message && error1.test(resToJSON.message)){
            handleBadResponse(resToJSON, curGuess);
            return;
        }

        const country = resToJSON?.message?.match(/^.*Country:\s?([\u0020-\u009f\u00a1-\uFFFF]+).*/si);
        curGuess.country = country && country[1] && /\w+/.test(country[1])? country[1] : null;
        
        const coords = await getCoords(resToJSON, curGuess.country);

        curGuess.latLng = coords.latLng; 
         
        if (curGuess?.latLng?.lng > 0 && curGuess?.country && westernCountries[curGuess?.country?.toLowerCase()]){
            curGuess.latLngNeg = true;
            curGuess.latLng.lng = -curGuess.latLng.lng;        
        }

        curGuess._latLng = coords.latLng; 

        curGuess.countryLatLng = coords.countryLatLng;

        curGuess.json = resToJSON;
        
        const newRoundListener = google.maps.event.addListener(state.GoogleMapsObj, "new round", ()=>{
            google.maps.event.removeListener(newRoundListener);
            hideAIGuess(curGuess);
        });

        curGuess.state = "Done";

        google.maps.event.trigger(state.GoogleMapsObj, "AI response finished", curGuess);

        newAlert(`AI has returned an answer for round #${curGuess.curRound}!`);

        console.log("curGuess", curGuess);
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
        curGuess.json = resToJSON;
        curGuess.badResponse = true;
        curGuess.points = 0;
        curGuess.latLng = bermudaTriangleCoords; 

        const newRoundListener = google.maps.event.addListener(state.GoogleMapsObj, "new round", ()=>{
            google.maps.event.removeListener(newRoundListener);
            hideAIGuess(curGuess);
        });

        curGuess.state = "Done";

        google.maps.event.trigger(state.GoogleMapsObj, "AI response finished", curGuess);

        newAlert(`AI has returned an answer for round #${curGuess.curRound}!`);

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
                
                state.gameInfo = resJSON;

                return new Promise((res) => {
                    res(v3APIRes);
                });
            }

            return _fetch.apply(window, args);
        };
    })();
    
    let ar = [];
    function newAlert(msg){
        const body = document.createElement('div');
        body.style.cssText = `position: absolute; left: -22em;  padding: 10px; transition: 1s ease-in-out all; background-color: white; font-size: 18px;font-family: var(--default-font); z-index: 999999;`;
        body.innerHTML = msg ;

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

})();

const westernCountries = {};

const westernCountriesArray = ["canada", "chile", "mexico", "usa", "united states", "guatamala", "panama", "columbia", "argintina", "brazil", "bolivia", "equidor", "ireland", "portugal", "senegal", "costa rica", "venezuala", "peru", "suriname", "puerto rico", "dominican republic", "uruguay","paraguay", "guyana", "french guiana", "nicaragua", "honduras",
                                "el salvador", "belize", "curacau", "aruba","virgin islands", "british virgin islands", "bermuda" ];

westernCountriesArray.forEach(country => westernCountries[country] = true); 

    document.head.insertAdjacentHTML(
    // Append style sheet for this script. 
    "beforeend",
    `<style>
    div.gm-style-iw.gm-style-iw-c {
        padding-right: 12px !important;
        padding-bottom: 12px !important;
    }

    div.gm-style-iw.gm-style-iw-c div.gm-style-iw-d {
        overflow: unset !important;
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
