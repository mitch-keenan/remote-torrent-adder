
const doBackground = () => {
	///////////////////////////////////////////////////////
	// TAKE CARE OF EXTENSION SETTINGS. VIRGIN/OLD INSTALL?
	///////////////////////////////////////////////////////
	if(RTA.storage.getItem("servers") == undefined) {
		var servers = [];

		// check if there's an old configuration, convert it to the new style
		if(RTA.storage.getItem("host") != undefined &&
			RTA.storage.getItem("port") != undefined &&
			RTA.storage.getItem("login") != undefined &&
			RTA.storage.getItem("password") != undefined &&
			RTA.storage.getItem("client") != undefined) {
			servers.push({
				"name": "primary host",
				"host": RTA.storage.getItem("host"),
				"port": parseInt(RTA.storage.getItem("port")),
				"hostsecure": RTA.storage.getItem("hostsecure") === "true",
				"login": RTA.storage.getItem("login"),
				"password": RTA.storage.getItem("password")
			});
		} else { // otherwise, use standard values
			servers.push({
				"name": "PRIMARY SERVER",
				"host": "127.0.0.1",
				"port": 6883,
				"hostsecure": "",
				"login": "login",
				"password": "password",
				"client": "Vuze SwingUI"
			});
			RTA.storage.setItem("linksfoundindicator", "true");
			RTA.storage.setItem("showpopups", "true");
			RTA.storage.setItem("popupduration", "2000");
			RTA.storage.setItem("catchfromcontextmenu", "true");
			RTA.storage.setItem("catchfrompage", "true");
			RTA.storage.setItem("linkmatches", "([\\]\\[]|\\b|\\.)\\.torrent\\b([^\\-]|$)~torrents\\.php\\?action=download");
		}
		RTA.storage.setItem("servers", JSON.stringify(servers));
	}



	//////////////////////////////////////////////////////
	// REGISTER CONTEXT (RIGHT-CLICK) MENU ITEMS FOR LINKS
	//////////////////////////////////////////////////////
	RTA.constructContextMenu();



	////////////////////
	// GRAB FROM NEW TAB
	////////////////////
	chrome.tabs.onCreated.addListener(function(tab) {
		var server = JSON.parse(RTA.storage.getItem("servers"))[0]; // primary server
		if(RTA.storage.getItem("catchfromnewtab") != "true") return;
		res = RTA.storage.getItem('linkmatches').split('~');
		for(mkey in res) {
			if (tab.url.match(new RegExp(res[mkey], "g"))) {
				RTA.getTorrent(server, tab.url);
				break;
			}
		}
	});



	/////////////////////////////////////////////////////
	// OVERWRITE THE CLICK-EVENT OF LINKS WE WANT TO GRAB
	/////////////////////////////////////////////////////
	chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
		var server = JSON.parse(RTA.storage.getItem("servers"))[0]; // primary server
		if(request.action == "addTorrent") {
			if(request.server) {
				server = request.server;
			}
			RTA.getTorrent(server, request.url, request.label, request.dir, request.referer);
			sendResponse({});
		} else if(request.action == "getStorageData") {
			sendResponse(RTA.storage);
		} else if(request.action == "setStorageData") {
			for(x in request.data)
				RTA.storage.setItem(x, request.data[x]);
			sendResponse({});
		} else if(request.action == "pageActionToggle") {
			chrome.browserAction.setIcon({path: {"16":"icons/BitTorrent16.png", "48":"icons/BitTorrent48.png", "128":"icons/BitTorrent128.png"}, tabId: sender.tab.id });
			sendResponse({});
		} else if(request.action == "constructContextMenu") {
			RTA.constructContextMenu();
			sendResponse({});
		} else if(request.action == "registerRefererListeners") {
			registerReferrerHeaderListeners();
		} else if(request.action == "registerAuthenticationListeners") {
			registerAuthenticationListeners();
		} 
	});

	///////////////////////////////////////////////////////////////////
	// CATCH WEBUI REQUESTS WHOSE CSRF PROTECTION WE NEED TO CIRCUMVENT
	///////////////////////////////////////////////////////////////////
	var listeners = [];
	function registerReferrerHeaderListeners() {
		// unregister old listeners
		while(listeners.length > 0) {
			chrome.webRequest.onBeforeSendHeaders.removeListener(listeners.pop());
		}
		
		// register new listeners
		var servers = JSON.parse(RTA.storage.getItem("servers"));
		for(var i in servers) {
			var server = servers[i];
			const url = "http" + (server.hostsecure ? "s" : "") + "://" + server.host + ":" + server.port + "/";
			
			const listener = (function(arg) {
				const myUrl = arg;

				return function(details) {
					var foundReferer = false;
					var foundOrigin = false;
					for (var j = 0; j < details.requestHeaders.length; ++j) {
						if (details.requestHeaders[j].name === 'Referer') {
							foundReferer = true;
							details.requestHeaders[j].value = myUrl;
						}
						
						if (details.requestHeaders[j].name === 'Origin') {
							foundOrigin = true;
							details.requestHeaders[j].value = myUrl;
						}
						
						if(foundReferer && foundOrigin) {
							break;
						}
					}
					
					if(!foundReferer) {
						details.requestHeaders.push({'name': 'Referer', 'value': myUrl});
					}
					
					if(!foundOrigin) {
						details.requestHeaders.push({'name': 'Origin', 'value': myUrl});
					}

					return {requestHeaders: details.requestHeaders};
				};
			})(url);
			
			if(server.host && server.port) {
				chrome.webRequest.onBeforeSendHeaders.addListener(listener, {urls: [ url + "*" ]}, ["blocking", "requestHeaders", "extraHeaders"]);
			}
			
			listeners.push(listener);
		}
	}

	registerReferrerHeaderListeners();

	/////////////////////////////////////////////////////
	// CATCH TORRENT LINKS AND ALTER THEIR REFERER/ORIGIN
	/////////////////////////////////////////////////////
	RTA.getTorrentLink = "";
	RTA.getTorrentLinkReferer = "";
	const headersListener = function(details) {
		var output = { };
		
		if(details.url == RTA.getTorrentLink) {
			var foundReferer = false;
			var foundOrigin = false;
			for (var j = 0; j < details.requestHeaders.length; ++j) {
				if (details.requestHeaders[j].name === 'Referer') {
					foundReferer = true;
					details.requestHeaders[j].value = RTA.getTorrentLinkReferer || details.url;
				}
				
				if (details.requestHeaders[j].name === 'Origin') {
					foundOrigin = true;
					details.requestHeaders[j].value = RTA.getTorrentLinkReferer || details.url;
				}
				
				if(foundReferer && foundOrigin) {
					break;
				}
			}
			
			if(!foundReferer) {
				details.requestHeaders.push({'name': 'Referer', 'value': RTA.getTorrentLinkReferer || details.url});
			}
			
			if(!foundOrigin) {
				details.requestHeaders.push({'name': 'Origin', 'value': RTA.getTorrentLinkReferer || details.url});
			}

			output = { requestHeaders: details.requestHeaders };

			RTA.getTorrentLink = "";
			RTA.getTorrentLinkReferer = "";
		}

		return output;
	};

	chrome.webRequest.onBeforeSendHeaders.addListener(headersListener, {urls: [ "<all_urls>" ]}, ["blocking", "requestHeaders", "extraHeaders"]);


	////////////////////////////////////////////////////
	// SUPPLY DIGEST AUTHENTICATION TO WEB UIS WE MANAGE
	////////////////////////////////////////////////////
	var onAuthListeners = [];
	var triedRequestIds = new Set();
	function registerAuthenticationListeners() {
		// unregister old listeners
		while(onAuthListeners.length > 0) {
			chrome.webRequest.onAuthRequired.removeListener(onAuthListeners.pop());
		}
		
		// register new listeners
		var servers = JSON.parse(RTA.storage.getItem("servers"));
		for(var i in servers) {
			var server = servers[i];
			const url = "http" + (server.hostsecure ? "s" : "") + "://" + server.host + ":" + server.port + "/";
			
			const listener = (function(user, pass, url) {
				return function(details) {
					var authStuff;
					
					if(triedRequestIds.has(details.requestId)) {
						authStuff = {  }; // cause the browser to resume default behavior
						triedRequestIds.delete(details.requestId);
					} else if(details.tabId != -1) {
						authStuff = {  };
					} else {
						authStuff = { authCredentials: { username: user, password: pass } };
						triedRequestIds.add(details.requestId);
					}
					
					return authStuff;
				};
			})(server.login, server.password, url);
			
			if(server.host && server.port) {
				chrome.webRequest.onAuthRequired.addListener(listener, { urls: [ url + "*" ], tabId: -1 }, ["blocking"]);
			}
			
			onAuthListeners.push(listener);
		}
	}

	registerAuthenticationListeners();


	/////////////////////////////////////////////////////////
	// register browser action for opening a tab to the webui
	/////////////////////////////////////////////////////////
	chrome.browserAction.onClicked.addListener(function(tab) {
		const servers = JSON.parse(RTA.storage.getItem("servers"));
		if(servers.length > 0) {
			const server = servers[0];
			const relativePath = server.ruTorrentrelativepath || server.utorrentrelativepath || server.delugerelativepath || server.rtorrentxmlrpcrelativepath || "/";
			const url = "http" + (server.hostsecure ? "s" : "") + "://" + server.host + ":" + server.port + relativePath;
			chrome.tabs.create({ url: url });
		}
	});
}

RTA.storage.addInitializedListener(doBackground);