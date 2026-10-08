/* ============================================================================
   TBRide :: public/app.js
   100% vanilla JavaScript + Leaflet + Socket.IO client. No framework, no build.

   One page hosts four independent role consoles. Each console owns its own
   authenticated Socket.IO connection, so a single browser can play rider,
   operator, driver and admin at the same time.
   ========================================================================== */
(function () {
  'use strict';

  var TASHKENT = { lat: 41.2995, lng: 69.2401 };
  /* ------------------------------------------------------------------ DOM */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function setText(sel, value) { var n = $(sel); if (n) n.textContent = value; }
  function show(sel, visible) { var n = $(sel); if (n) n.classList.toggle('hidden', !visible); }

  /* ------------------------------------------------------------------ i18n */
  var I18N = window.I18N || null;
  /** Translate an English source string (see public/i18n.js). */
  function t(source, vars) { return I18N ? I18N.t(source, vars) : source; }
  /** Translate, but fall back to `fallback` when no translation exists. */
  function tOr(source, fallback) { var out = t(source); return out === source ? fallback : out; }

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined && html !== null) node.innerHTML = html;
    return node;
  }

  function toast(title, message, kind) {
    var box = el('div', 'toast ' + (kind || ''), '<b></b><span></span>');
    box.querySelector('b').textContent = title;
    box.querySelector('span').textContent = message || '';
    $('#toasts').appendChild(box);
    setTimeout(function () {
      box.style.opacity = '0';
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 250);
    }, 4200);
  }

  function logEvent(text, isError) {
    var list = $('#event-log');
    var line = el('li', isError ? 'err' : '', '');
    var time = new Date().toLocaleTimeString();
    line.innerHTML = '<b></b> <span></span>';
    line.querySelector('b').textContent = time;
    line.querySelector('span').textContent = text;
    list.insertBefore(line, list.firstChild);
    while (list.children.length > 80) list.removeChild(list.lastChild);
  }

  function fmt(n, digits) {
    if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '—';
    return Number(n).toFixed(digits === undefined ? 5 : digits);
  }
  function coordText(p) { return p ? fmt(p.lat) + ', ' + fmt(p.lng) : '—'; }
  function money(v) { return v ? Number(v).toLocaleString('en-US') + ' UZS' : '—'; }
  function short(id) { return id ? String(id).slice(0, 8) : '—'; }
  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ----------------------------------------------------------------- state */
  var state = {
    role: 'user',
    sessions: {},        // role -> { token, user, socket }
    rider: {
      pickup: { lat: 41.2995, lng: 69.2401 },
      dropoff: { lat: 41.3111, lng: 69.2797 },
      mode: 'pickup',
      activeRide: null,
      rides: [],
      selectedHistoryId: null
    },
    operator: { pending: [], live: [], drivers: [], selectedRideId: null },
    driver: {
      profile: null, offer: null, activeRide: null, history: [],
      lastLocation: null,
      watchId: null
    },
    admin: { table: 'users', overview: null }
  };
  var authRole = 'user';
  var headerAccountRole = null;

  /* ------------------------------------------------------------------- API */
  function api(path, options) {
    var opts = options || {};
    var headers = { 'Content-Type': 'application/json' };
    if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
    return fetch(path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var message = body && body.error && body.error.message ? body.error.message : ('HTTP ' + res.status);
          var error = new Error(message);
          error.status = res.status;
          throw error;
        }
        return body;
      });
    });
  }

  /* ------------------------------------------------------------------ MAP */
  var map = null;
  var layers = {};
  var opDriverMarkers = {};   // driverId -> L.Marker
  var riderDriverMarker = null;
  var driverSelfMarker = null;
  var adminMarkers = {};

  function pinIcon(kind, glyph) {
    return L.divIcon({
      className: '',
      html: '<div class="' + kind + '"><span>' + glyph + '</span></div>',
      iconSize: kind.indexOf('driver-pin') === 0 ? [30, 30] : [26, 26],
      iconAnchor: [15, 28],
      popupAnchor: [0, -26]
    });
  }

  function initMap() {
    map = L.map('map', { center: [TASHKENT.lat, TASHKENT.lng], zoom: 13, zoomControl: true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    }).addTo(map);

    layers.rider = L.layerGroup().addTo(map);
    layers.operator = L.layerGroup().addTo(map);
    layers.driver = L.layerGroup().addTo(map);
    layers.admin = L.layerGroup().addTo(map);

    // Rider markers -------------------------------------------------------
    state.rider.pickupMarker = L.marker([state.rider.pickup.lat, state.rider.pickup.lng], {
      draggable: true, icon: pinIcon('ride-pin pickup', 'A')
    }).addTo(layers.rider).bindPopup('<b>Pickup</b><br>Drag me');

    state.rider.dropoffMarker = L.marker([state.rider.dropoff.lat, state.rider.dropoff.lng], {
      draggable: true, icon: pinIcon('ride-pin dropoff', 'B')
    }).addTo(layers.rider).bindPopup('<b>Destination</b><br>Drag me');

    state.rider.routeLine = L.polyline([], { color: '#2fd07f', weight: 4, dashArray: '8 8' }).addTo(layers.rider);

    state.rider.pickupMarker.on('dragend', function () {
      var p = state.rider.pickupMarker.getLatLng();
      state.rider.pickup = { lat: p.lat, lng: p.lng };
      refreshRiderEstimate();
    });
    state.rider.dropoffMarker.on('dragend', function () {
      var p = state.rider.dropoffMarker.getLatLng();
      state.rider.dropoff = { lat: p.lat, lng: p.lng };
      refreshRiderEstimate();
    });

    // Click to place the marker of the currently selected rider mode.
    map.on('click', function (e) {
      if (state.role === 'user') {
        var point = { lat: e.latlng.lat, lng: e.latlng.lng };
        if (state.rider.mode === 'pickup') {
          state.rider.pickup = point;
          state.rider.pickupMarker.setLatLng(point);
        } else {
          state.rider.dropoff = point;
          state.rider.dropoffMarker.setLatLng(point);
        }
        refreshRiderEstimate();
      } else if (state.role === 'operator' && state.operator.selectedRideId) {
        // click-to-dispatch fallback: a card is armed, clicking a marker assigns.
      }
    });

    applyRoleToMap();
  }

  function applyRoleToMap() {
    var role = state.role;
    var activeLayer = role === 'user' ? 'rider' : role;
    ['rider', 'operator', 'driver', 'admin'].forEach(function (key) {
      if (!layers[key]) return;
      if (key === activeLayer) {
        if (!map.hasLayer(layers[key])) layers[key].addTo(map);
      } else if (map.hasLayer(layers[key])) {
        map.removeLayer(layers[key]);
      }
    });
    $('#map-legend').textContent = 'Tashkent · ' + fmt(TASHKENT.lat) + ', ' + fmt(TASHKENT.lng) +
      ' · view: ' + role;
  }

  function drawRiderRoute() {
    var r = state.rider;
    r.routeLine.setLatLngs([[r.pickup.lat, r.pickup.lng], [r.dropoff.lat, r.dropoff.lng]]);
    setText('#rider-pickup-coords', coordText(r.pickup));
    setText('#rider-dropoff-coords', coordText(r.dropoff));
  }

  function refreshRiderEstimate() {
    drawRiderRoute();
    var d = haversineKm(state.rider.pickup, state.rider.dropoff);
    setText('#rider-quote-distance', d.toFixed(2) + ' km');
    setText('#rider-quote-fare', money(Math.round(9000 + d * 2500)));
  }

  function haversineKm(a, b) {
    var R = 6371, toRad = function (x) { return x * Math.PI / 180; };
    var dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function setRiderDriverMarker(location) {
    if (!location) return;
    var latlng = [location.lat, location.lng];
    if (!riderDriverMarker) {
      riderDriverMarker = L.marker(latlng, { icon: pinIcon('driver-pin active', '🚕') }).addTo(layers.rider);
    } else {
      riderDriverMarker.setLatLng(latlng);
    }
    riderDriverMarker.bindPopup('<b>Your driver</b><br>' + coordText(location));
  }

  function setDriverSelfMarker(location) {
    if (!location) return;
    var latlng = [location.lat, location.lng];
    if (!driverSelfMarker) {
      driverSelfMarker = L.marker(latlng, { icon: pinIcon('driver-pin online', '🚕') }).addTo(layers.driver)
        .bindPopup('<b>You</b><br>' + coordText(location));
    } else {
      driverSelfMarker.setLatLng(latlng);
    }
    map.panTo(latlng, { animate: true });
  }

  function bindOperatorDriverDrop(marker, driverId) {
    function attachDropHandlers() {
      var icon = marker.getElement();
      if (!icon || icon._rideDropBound) return;
      icon._rideDropBound = true;
      icon.addEventListener('dragover', function (e) {
        if (!state.operator.selectedRideId) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        clearDropHighlight();
        icon.classList.add('drop-target');
        state.operator.dropTargetDriverId = driverId;
      });
      icon.addEventListener('dragleave', function (e) {
        if (e.relatedTarget && icon.contains(e.relatedTarget)) return;
        icon.classList.remove('drop-target');
        if (state.operator.dropTargetDriverId === driverId) state.operator.dropTargetDriverId = null;
      });
      icon.addEventListener('drop', function (e) {
        if (!state.operator.selectedRideId) return;
        e.preventDefault();
        e.stopPropagation();
        var data = parseDragData(e);
        clearDropHighlight();
        state.operator.dropTargetDriverId = null;
        $('#drop-overlay').classList.remove('show');
        if (!data || !data.rideId) {
          toast(t('Drop failed'), t('Drag a pending ride onto a driver'), 'warn');
          return;
        }
        assignRide(data.rideId, driverId);
        armRideCard(null);
      });
    }

    if (!marker._rideDropAddBound) {
      marker.on('add', attachDropHandlers);
      marker._rideDropAddBound = true;
    }
    attachDropHandlers();
  }

  function upsertOperatorDriverMarker(driver) {
    if (!driver.location) return removeOperatorDriverMarker(driver.driverId);
    var latlng = [driver.location.lat, driver.location.lng];
    var marker = opDriverMarkers[driver.driverId];
    var kind = 'driver-pin ' + (driver.status === 'active' ? 'active' : 'online');
    var glyph = driver.status === 'active' ? '🚕' : '🚖';
    if (!marker) {
      marker = L.marker(latlng, { icon: pinIcon(kind, glyph), draggable: false });
      bindOperatorDriverDrop(marker, driver.driverId);
      marker.addTo(layers.operator);
      opDriverMarkers[driver.driverId] = marker;
      marker.on('click', function () {
        if (state.operator.selectedRideId) {
          assignRide(state.operator.selectedRideId, driver.driverId);
          armRideCard(null);
        } else {
          marker.openPopup();
        }
      });
    } else {
      marker.setLatLng(latlng);
      marker.setIcon(pinIcon(kind, glyph));
      bindOperatorDriverDrop(marker, driver.driverId);
    }
    marker.bindPopup(popupForDriver(driver));
    return marker;
  }

  function removeOperatorDriverMarker(driverId) {
    var marker = opDriverMarkers[driverId];
    if (marker) {
      layers.operator.removeLayer(marker);
      delete opDriverMarkers[driverId];
    }
  }

  function popupForDriver(driver) {
    return '<b>' + esc(driver.fullName) + '</b><br>' +
      esc(driver.vehicleModel || '') + ' · ' + esc(driver.licensePlate || '') + '<br>' +
      'status: ' + esc(driver.status) + '<br>' + coordText(driver.location);
  }

  /* ------------------------- operator ride overlays ---------------------- */
  var opRidePins = {};   // rideId -> { pickup, dropoff, line }

  function drawOperatorRide(ride) {
    clearOperatorRide(ride.id);
    var pickup = L.marker([ride.pickup.lat, ride.pickup.lng], {
      icon: pinIcon('ride-pin ' + (ride.status === 'pending' ? 'pending' : 'pickup'), 'A')
    }).addTo(layers.operator)
      .bindPopup('<b>' + esc(ride.status) + '</b><br>' + esc(ride.riderName || 'rider') + '<br>' +
        (ride.pickupLabel ? esc(ride.pickupLabel) + ' → ' + esc(ride.dropoffLabel || '?') + '<br>' : '') +
        'pickup: ' + coordText(ride.pickup) + '<br>drop: ' + coordText(ride.dropoff));
    var dropoff = L.marker([ride.dropoff.lat, ride.dropoff.lng], {
      icon: pinIcon('ride-pin dropoff', 'B')
    }).addTo(layers.operator);
    var line = L.polyline([[ride.pickup.lat, ride.pickup.lng], [ride.dropoff.lat, ride.dropoff.lng]], {
      color: ride.status === 'in_progress' ? '#ffb020' : '#4aa8ff',
      weight: 3, dashArray: '6 8'
    }).addTo(layers.operator);
    opRidePins[ride.id] = { pickup: pickup, dropoff: dropoff, line: line };
  }

  function clearOperatorRide(rideId) {
    var pins = opRidePins[rideId];
    if (pins) {
      ['pickup', 'dropoff', 'line'].forEach(function (k) { layers.operator.removeLayer(pins[k]); });
      delete opRidePins[rideId];
    }
  }

  function redrawOperatorRides() {
    Object.keys(opRidePins).forEach(clearOperatorRide);
    state.operator.pending.forEach(function (r) { drawOperatorRide(r); });
    state.operator.live.forEach(function (r) { drawOperatorRide(r); });
  }

  /* ------------------------------------------------------------- sessions */
  function setConnection(status, text) {
    var dot = $('#conn-dot');
    dot.className = 'dot ' + (status === 'on' ? 'on' : status === 'off' ? 'off' : '');
    setText('#conn-text', text);
  }

  function login(role, phone, password) {
    return api('/api/auth/login', { method: 'POST', body: { phone_number: phone, password: password } })
      .then(function (session) {
        if (!session.user || session.user.role !== role) {
          var message = t('This account cannot access this console');
          toast(t('Sign in failed'), message, 'error');
          logEvent(t('sign in failed: {message}', { message: message }), true);
          return null;
        }
        state.sessions[role] = { token: session.token, user: session.user, socket: null };
        persistSession(role, session.token);
        state.role = role;
        updateRoleAccessUI();
        go(ROLE_ROUTES[role]);
        closeAuthModal();
        logEvent(t('signed in as {role} · {name}', { role: session.user.role, name: session.user.fullName }));
        openSocket(role);
        return session;
      })
      .catch(function (err) {
        toast(t('Sign in failed'), err.message, 'error');
        logEvent(t('sign in failed: {message}', { message: err.message }), true);
        throw err;
      });
  }

  function signupRider(fullName, phone, password) {
    return api('/api/auth/register', {
      method: 'POST',
      body: { full_name: fullName, phone_number: phone, password: password }
    }).then(function (session) {
      state.sessions.user = { token: session.token, user: session.user, socket: null };
      persistSession('user', session.token);
      state.role = 'user';
      updateRoleAccessUI();
      go(ROLE_ROUTES.user);
      closeAuthModal();
      logEvent(t('account created · {name}', { name: session.user.fullName }));
      openSocket('user');
      return session;
    }).catch(function (err) {
      toast(t('Sign up failed'), err.message, 'error');
      logEvent(t('sign up failed: {message}', { message: err.message }), true);
      throw err;
    });
  }

  var SESSION_STORAGE_PREFIX = 'paperide.auth.v1.';

  function persistSession(role, token) {
    try {
      window.localStorage.setItem(SESSION_STORAGE_PREFIX + role, token);
    } catch (err) {
      toast(t('Session not saved'), t('You may need to sign in again after reloading this page.'), 'warn');
      logEvent(t('session could not be saved: {message}', { message: err.message }), true);
    }
  }

  function restoreSession(role, token) {
    return api('/api/auth/me', { token: token }).then(function (data) {
      if (!data.user || data.user.role !== role) {
        window.localStorage.removeItem(SESSION_STORAGE_PREFIX + role);
        logEvent(t('saved {role} session does not match its account; sign in again', { role: role }), true);
        return;
      }
      state.sessions[role] = { token: token, user: data.user, socket: null };
      updateRoleAccessUI();
      if (routeForHash() === ROLE_ROUTES[role]) navigate();
      openSocket(role);
    }).catch(function (err) {
      if (err.status === 401 || err.status === 403) {
        window.localStorage.removeItem(SESSION_STORAGE_PREFIX + role);
        logEvent(t('saved {role} session expired; sign in again', { role: role }), true);
      } else {
        toast(t('Could not restore session'), err.message, 'error');
        logEvent(t('could not restore {role} session: {message}', { role: role, message: err.message }), true);
      }
    });
  }

  function restoreSavedSessions() {
    ['user', 'driver', 'operator', 'admin'].forEach(function (role) {
      var token = window.localStorage.getItem(SESSION_STORAGE_PREFIX + role);
      if (token) restoreSession(role, token);
    });
  }

  function logout(role, fromStorageEvent) {
    var session = state.sessions[role];
    if (session && session.socket) session.socket.disconnect();
    if (role === 'driver') stopDeviceGps();
    if (!fromStorageEvent) window.localStorage.removeItem(SESSION_STORAGE_PREFIX + role);
    delete state.sessions[role];
    renderSessionUI(role);
    var nextRole = state.sessions.user ? 'user'
      : state.sessions.driver ? 'driver'
        : state.sessions.operator ? 'operator'
          : state.sessions.admin ? 'admin' : null;
    if (nextRole) {
      state.role = nextRole;
      window.location.hash = '#' + ROLE_ROUTES[nextRole];
    } else {
      window.location.hash = '#/';
    }
    updateRoleAccessUI();
    navigate();
    logEvent(t('signed out of {role}', { role: role }));
  }

  function openSocket(role) {
    var session = state.sessions[role];
    if (!session) return;
    if (session.socket) { session.socket.disconnect(); session.socket = null; }

    var socket = io({ auth: { token: session.token }, transports: ['websocket', 'polling'] });
    session.socket = socket;

    socket.on('connect', function () {
      logEvent('[' + role + '] socket connected (' + socket.id + ')');
      if (role === state.role) setConnection('on', 'live · ' + role);
    });

    // The server answers with connection:ready once every handler is attached
    // and the initial snapshot has been loaded.
    socket.on('connection:ready', function (payload) {
      logEvent('[' + role + '] authenticated as ' + payload.identity.role + ' · rooms joined');
      refreshSession(role);
    });

    socket.on('disconnect', function (reason) {
      logEvent('[' + role + '] socket disconnected: ' + reason);
      if (role === state.role) setConnection('off', 'disconnected');
    });

    socket.on('connect_error', function (err) {
      logEvent('[' + role + '] connect error: ' + (err && err.message), true);
      if (role === state.role) setConnection('off', 'auth failed');
      if (err && /account no longer exists|role has changed/i.test(err.message || '')) {
        logout(role);
      }
    });

    socket.on('server:error', function (payload) {
      toast('Server rejected ' + payload.event, payload.message, 'error');
      logEvent('[' + payload.event + '] ' + payload.code + ': ' + payload.message, true);
    });

    socket.on('connection:ready', function (payload) {
      logEvent('[' + role + '] authenticated as ' + payload.identity.role + ' · rooms joined');
    });

    // ---- server -> client events -----------------------------------------
    socket.on('user:snapshot', function (payload) { if (role === 'user') onRiderSnapshot(payload); });
    socket.on('ride:created', function (payload) {
      if (role === 'user') { onRiderRideUpdate(payload.ride, 'Ride created'); }
    });
    socket.on('ride:status_update', function (payload) {
      handleRideStatusUpdate(role, payload);
    });
    socket.on('driver:snapshot', function (payload) { if (role === 'driver') onDriverSnapshot(payload); });
    socket.on('driver:ride_offer', function (payload) { if (role === 'driver') onDriverOffer(payload); });
    socket.on('ride:driver_location', function (payload) {
      if (role === 'user' && state.rider.activeRide && payload.rideId === state.rider.activeRide.id) {
        setRiderDriverMarker({ lat: payload.lat, lng: payload.lng });
        setText('#rider-driver-phone', t('last fix: {time}', { time: new Date(payload.updatedAt).toLocaleTimeString() }));
      }
      if (role === 'driver') setDriverSelfMarker({ lat: payload.lat, lng: payload.lng });
    });
    socket.on('ride:new_request', function (payload) {
      if (role === 'operator' || role === 'admin') {
        upsertOperatorRide(payload.ride);
        toast('New ride request', (payload.ride.riderName || 'rider') + ' · ' +
          payload.ride.quote.distanceKm + ' km', 'warn');
        logEvent('ride:new_request ' + short(payload.ride.id));
      }
    });
    socket.on('ride:available', function (payload) {
      if (role === 'driver' && !state.driver.activeRide && !state.driver.offer) {
        state.driver.available = payload.ride;
        logEvent('ride available ' + short(payload.ride.id) + ' · ' + payload.ride.quote.distanceKm + ' km');
      }
    });
    socket.on('ride:removed', function (payload) {
      if (role === 'driver') {
        if (state.driver.offer && state.driver.offer.id === payload.rideId) {
          state.driver.offer = null;
          renderDriverOffer();
          toast('Ride withdrawn', payload.reason || 'no longer available', 'warn');
        }
      }
      if (role === 'operator' || role === 'admin') {
        state.operator.pending = state.operator.pending.filter(function (r) { return r.id !== payload.rideId; });
        state.operator.live = state.operator.live.filter(function (r) { return r.id !== payload.rideId; });
        clearOperatorRide(payload.rideId);
        renderOperatorBoard();
      }
    });
    socket.on('operator:snapshot', function (payload) {
      if (role === 'operator' || role === 'admin') onOperatorSnapshot(payload);
    });
    socket.on('driver:location', function (payload) {
      if (role === 'operator' || role === 'admin') {
        state.operator.drivers = state.operator.drivers.map(function (d) {
          return d.driverId === payload.driverId
            ? Object.assign({}, d, { location: { lat: payload.lat, lng: payload.lng }, updatedAt: payload.updatedAt })
            : d;
        });
        upsertOperatorDriverMarker({
          driverId: payload.driverId,
          fullName: payload.driverId,
          status: payload.status,
          location: { lat: payload.lat, lng: payload.lng }
        });
      }
    });
    socket.on('driver:status', function (payload) {
      if (role === 'operator' || role === 'admin') {
        var existing = state.operator.drivers.filter(function (d) { return d.driverId === payload.driverId; })[0];
        var merged = Object.assign({}, existing || {
          driverId: payload.driverId,
          fullName: payload.fullName || payload.driverId,
          vehicleModel: payload.vehicleModel || '',
          licensePlate: payload.licensePlate || ''
        }, { status: payload.status, location: payload.location || (existing && existing.location) || null });
        if (payload.status === 'offline') {
          state.operator.drivers = state.operator.drivers.filter(function (d) { return d.driverId !== payload.driverId; });
          removeOperatorDriverMarker(payload.driverId);
        } else {
          if (!existing) state.operator.drivers.push(merged);
          upsertOperatorDriverMarker(merged);
        }
        renderOperatorBoard();
        logEvent('driver ' + short(payload.driverId) + ' -> ' + payload.status);
      }
      if (role === 'driver' && payload.driverId === (state.sessions.driver && state.sessions.driver.user.id)) {
        state.driver.profile = Object.assign({}, state.driver.profile || {}, { status: payload.status });
        renderDriverStatus();
      }
    });

    renderSessionUI(role);
  }

  /** Ask the server for the freshest snapshot after (re)connecting. */
  function refreshSession(role) {
    var session = state.sessions[role];
    if (!session || !session.socket) return;
    if (role === 'user') api('/api/overview', { token: session.token }).then(onRiderSnapshot).catch(function () {});
    if (role === 'operator' || role === 'admin') {
      session.socket.emit('operator:snapshot_request', {}, function (ack) {
        if (ack && ack.ok) onOperatorSnapshot(ack.data);
      });
    }
    if (role === 'driver') api('/api/overview', { token: session.token }).then(onDriverSnapshot).catch(function () {});
    if (role === 'admin') loadAdminOverview();
  }

  /* ---------------------------------------------------------- rider logic */
  function onRiderSnapshot(payload) {
    state.rider.rides = payload.rides || [];
    state.rider.activeRide = payload.activeRide || null;
    if (payload.user) setText('#rider-name', payload.user.name || 'rider');
    renderRiderHistory();
    if (state.rider.activeRide) {
      renderRiderRide(state.rider.activeRide);
      var ride = state.rider.activeRide;
      state.rider.pickup = ride.pickup;
      state.rider.dropoff = ride.dropoff;
      state.rider.pickupMarker.setLatLng([ride.pickup.lat, ride.pickup.lng]);
      state.rider.dropoffMarker.setLatLng([ride.dropoff.lat, ride.dropoff.lng]);
      if (ride.driverLocation) setRiderDriverMarker(ride.driverLocation);
      refreshRiderEstimate();
    } else {
      renderRiderRide(null);
    }
  }

  function onRiderRideUpdate(ride, title) {
    if (!ride) return;
    state.rider.activeRide = ['pending', 'assigned', 'in_progress'].indexOf(ride.status) !== -1 ? ride : null;
    renderRiderRide(ride);
    toast(title || t('Ride update'), t('status: {status}', { status: t(ride.status) }), ride.status === 'cancelled' ? 'error' : 'success');
  }

  function renderRiderRide(ride) {
    var card = $('#rider-driver-card');
    if (!ride) {
      show('#rider-driver-card', false);
      setText('#rider-status-badge', t('idle'));
      $('#rider-request-btn').disabled = false;
      $('#rider-cancel-btn').disabled = true;
      return;
    }
    setText('#rider-status-badge', t(ride.status));
    $('#rider-status-badge').className = 'badge ' + ride.status;
    $('#rider-request-btn').disabled = ride.status !== 'pending' && ride.status !== 'cancelled' && ride.status !== 'completed';
    $('#rider-cancel-btn').disabled = ['pending', 'assigned'].indexOf(ride.status) === -1;
    if (ride.assignedDriverId) {
      show('#rider-driver-card', true);
      setText('#rider-driver-name', ride.driverName || t('Driver'));
      setText('#rider-driver-vehicle', (ride.vehicleModel || '') + ' · ' + (ride.licensePlate || '') +
        ' · ' + (ride.quote ? ride.quote.fare.toLocaleString('en-US') + ' UZS' : ''));
      setText('#rider-driver-phone', ride.driverPhone || '');
      if (ride.driverLocation) setRiderDriverMarker(ride.driverLocation);
      var target = ride.status === 'in_progress' ? ride.dropoff : ride.pickup;
      map.panTo([target.lat, target.lng]);
    } else {
      show('#rider-driver-card', false);
    }
    if (ride.status === 'completed' || ride.status === 'cancelled') {
      if (riderDriverMarker) { layers.rider.removeLayer(riderDriverMarker); riderDriverMarker = null; }
    }
    logEvent('ride ' + short(ride.id) + ' -> ' + ride.status);
  }

  function renderRiderHistory() {
    var list = $('#rider-history');
    list.innerHTML = '';
    state.rider.rides.forEach(function (ride) {
      var item = el('li', 'item' + (ride.status === 'completed' || ride.status === 'cancelled' ? ' done-item' : ''));
      item.innerHTML =
        '<div class="item-head"><span class="item-title">' + esc(t(ride.status)) + '</span>' +
        '<span class="meta">' + new Date(ride.createdAt).toLocaleTimeString() + '</span></div>' +
        '<div class="meta">' + coordText(ride.pickup) + ' → ' + coordText(ride.dropoff) + '</div>' +
        '<div class="meta">' + (ride.quote ? ride.quote.distanceKm + ' km · ' + money(ride.quote.fare) : '') + '</div>';
      item.addEventListener('click', function () {
        state.rider.pickup = ride.pickup;
        state.rider.dropoff = ride.dropoff;
        state.rider.pickupMarker.setLatLng([ride.pickup.lat, ride.pickup.lng]);
        state.rider.dropoffMarker.setLatLng([ride.dropoff.lat, ride.dropoff.lng]);
        refreshRiderEstimate();
        map.fitBounds(L.latLngBounds([[ride.pickup.lat, ride.pickup.lng], [ride.dropoff.lat, ride.dropoff.lng]]), { padding: [40, 40] });
      });
      list.appendChild(item);
    });
    if (!state.rider.rides.length) list.appendChild(el('li', 'hint', t('No rides yet — drop your markers and request one.')));
  }

  function requestRide() {
    var session = state.sessions.user;
    if (!session || !session.socket) { toast(t('Not signed in'), t('Sign in as a rider first'), 'error'); return; }
    session.socket.emit('user:request_ride', {
      pickup_lat: state.rider.pickup.lat,
      pickup_lng: state.rider.pickup.lng,
      dropoff_lat: state.rider.dropoff.lat,
      dropoff_lng: state.rider.dropoff.lng
    }, function (ack) {
      if (ack && ack.ok) {
        state.rider.activeRide = ack.data.ride;
        renderRiderRide(ack.data.ride);
        toast(t('Ride requested'), t('waiting for an operator…'), 'success');
        logEvent('user:request_ride ok ' + short(ack.data.ride.id));
      } else if (ack && ack.error) {
        toast(t('Request rejected'), ack.error.message, 'error');
      }
    });
  }

  function cancelRide() {
    var session = state.sessions.user;
    var ride = state.rider.activeRide;
    if (!session || !session.socket || !ride) return;
    session.socket.emit('user:cancel_ride', { ride_id: ride.id, reason: 'rider_cancelled' }, function (ack) {
      if (ack && ack.ok) {
        toast(t('Ride cancelled'), t('before driver arrival'), 'warn');
        state.rider.activeRide = null;
        renderRiderRide(ack.data.ride);
      }
    });
  }

  /* ------------------------------------------------------- operator logic */
  function onOperatorSnapshot(payload) {
    state.operator.pending = payload.pending || [];
    state.operator.live = payload.live || [];
    state.operator.drivers = payload.drivers || [];
    redrawOperatorRides();
    state.operator.drivers.forEach(upsertOperatorDriverMarker);
    Object.keys(opDriverMarkers).forEach(function (id) {
      if (!state.operator.drivers.some(function (d) { return d.driverId === id; })) {
        removeOperatorDriverMarker(id);
      }
    });
    renderOperatorBoard();
  }

  function upsertOperatorRide(ride) {
    var inPending = state.operator.pending.some(function (r) { return r.id === ride.id; });
    var inLive = state.operator.live.some(function (r) { return r.id === ride.id; });
    if (ride.status === 'pending') {
      if (!inPending) state.operator.pending.unshift(ride);
      state.operator.live = state.operator.live.filter(function (r) { return r.id !== ride.id; });
    } else {
      if (!inLive) state.operator.live.unshift(ride);
      state.operator.pending = state.operator.pending.filter(function (r) { return r.id !== ride.id; });
    }
    drawOperatorRide(ride);
    renderOperatorBoard();
  }

  function rideItem(ride, options) {
    var item = el('li', 'item' + (options && options.live ? ' live-item' : ''));
    item.setAttribute('data-ride-id', ride.id);
    if (options && options.draggable) item.setAttribute('draggable', 'true');
    item.innerHTML =
      '<div class="item-head">' +
        '<span class="item-title">' + esc(ride.riderName || t('rider')) + ' · ' + esc(t(ride.status)) + '</span>' +
        '<span class="meta">' + (ride.quote ? ride.quote.distanceKm + ' km · ' + money(ride.quote.fare) : '') + '</span>' +
      '</div>' +
      '<div class="meta">A ' + coordText(ride.pickup) + '</div>' +
      '<div class="meta">B ' + coordText(ride.dropoff) + '</div>' +
      (ride.driverName ? '<div class="meta">' + t('driver') + ': ' + esc(ride.driverName) + ' (' + short(ride.assignedDriverId) + ')</div>' : '<div class="meta">' + t('unassigned') + '</div>') +
      '<div class="item-actions">' +
        '<button class="btn small primary" data-act="auto">' + t('Auto-assign') + '</button>' +
        '<button class="btn small" data-act="focus">' + t('Focus') + '</button>' +
        '<button class="btn small danger" data-act="cancel">' + t('Cancel') + '</button>' +
      '</div>';

    if (options && options.draggable) {
      item.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', JSON.stringify({ rideId: ride.id }));
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('dragging');
        state.operator.selectedRideId = ride.id;
        $('#drop-overlay').classList.add('show');
      });
      item.addEventListener('dragend', function () {
        item.classList.remove('dragging');
        clearDropHighlight();
        $('#drop-overlay').classList.remove('show');
      });
    }

    item.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'auto') { autoAssign(ride.id); return; }
      if (act === 'cancel') { operatorCancel(ride.id); return; }
      map.fitBounds(L.latLngBounds([[ride.pickup.lat, ride.pickup.lng], [ride.dropoff.lat, ride.dropoff.lng]]), { padding: [50, 50] });
      if (options && options.draggable) armRideCard(state.operator.selectedRideId === ride.id ? null : ride.id);
    });

    if (state.operator.selectedRideId === ride.id) item.classList.add('selected');
    return item;
  }

  function driverItem(driver) {
    var item = el('li', 'item driver-item');
    item.setAttribute('data-driver-id', driver.driverId);
    item.innerHTML =
      '<div class="item-head"><span class="item-title">' + esc(driver.fullName) + '</span>' +
      '<span class="badge ' + driver.status + '">' + esc(t(driver.status)) + '</span></div>' +
      '<div class="meta">' + esc(driver.vehicleModel || '') + ' · ' + esc(driver.licensePlate || '') + '</div>' +
      '<div class="meta">' + coordText(driver.location) + '</div>';
    item.addEventListener('click', function () {
      if (driver.location) map.panTo([driver.location.lat, driver.location.lng]);
    });
    // native drop target
    item.addEventListener('dragover', function (e) {
      if (!state.operator.selectedRideId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', function () { item.classList.remove('drag-over'); });
    item.addEventListener('drop', function (e) {
      e.preventDefault();
      item.classList.remove('drag-over');
      var data = parseDragData(e);
      if (data && data.rideId) assignRide(data.rideId, driver.driverId);
    });
    return item;
  }

  function parseDragData(e) {
    try {
      var raw = e.dataTransfer.getData('text/plain');
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function armRideCard(rideId) {
    state.operator.selectedRideId = rideId;
    $all('#op-pending .item').forEach(function (node) {
      node.classList.toggle('selected', node.getAttribute('data-ride-id') === rideId);
    });
    logEvent(rideId ? 'armed ride ' + short(rideId) + ' — click a driver marker to dispatch' : 'dispatch armed cancelled');
  }

  function clearDropHighlight() {
    Object.keys(opDriverMarkers).forEach(function (id) {
      var marker = opDriverMarkers[id];
      if (marker && marker._icon) marker._icon.classList.remove('drop-target');
    });
  }

  function nearestDriverMarker(clientX, clientY) {
    var rect = $('#map').getBoundingClientRect();
    var px = clientX - rect.left, py = clientY - rect.top;
    var best = null, bestDist = Infinity;
    Object.keys(opDriverMarkers).forEach(function (id) {
      var marker = opDriverMarkers[id];
      if (!marker) return;
      var p = map.latLngToContainerPoint(marker.getLatLng());
      var d = Math.sqrt(Math.pow(p.x - px, 2) + Math.pow(p.y - py, 2));
      if (d < bestDist) { bestDist = d; best = { id: id, dist: d }; }
    });
    return best && best.dist <= 72 ? best.id : null;
  }

  function renderOperatorBoard() {
    var pending = $('#op-pending');
    var live = $('#op-live');
    var drivers = $('#op-drivers');
    pending.innerHTML = '';
    live.innerHTML = '';
    drivers.innerHTML = '';

    state.operator.pending.forEach(function (ride) { pending.appendChild(rideItem(ride, { draggable: true })); });
    state.operator.live.forEach(function (ride) { live.appendChild(rideItem(ride, { live: true })); });
    state.operator.drivers.forEach(function (driver) { drivers.appendChild(driverItem(driver)); });

    if (!state.operator.pending.length) pending.appendChild(el('li', 'hint', t('No pending rides.')));
    if (!state.operator.live.length) live.appendChild(el('li', 'hint', t('No live rides.')));
    if (!state.operator.drivers.length) drivers.appendChild(el('li', 'hint', t('No online drivers.')));

    setText('#op-count-pending', state.operator.pending.length);
    setText('#op-count-live', state.operator.live.length);
    setText('#op-count-drivers', state.operator.drivers.length);
    setText('#op-pending-pill', state.operator.pending.length);
    setText('#op-live-pill', state.operator.live.length);
    setText('#op-drivers-pill', state.operator.drivers.length);
  }

  function handleRideStatusUpdate(role, payload) {
    var ride = payload.ride;
    if (!ride) return;
    if (role === 'user') {
      var mine = state.sessions.user && ride.userId === state.sessions.user.user.id;
      if (mine) onRiderRideUpdate(ride, t('Ride {status}', { status: t(payload.status) }));
      return;
    }
    if (role === 'operator' || role === 'admin') {
      state.operator.pending = state.operator.pending.filter(function (r) { return r.id !== ride.id; });
      var replaced = false;
      state.operator.live = state.operator.live.map(function (r) {
        if (r.id === ride.id) { replaced = true; return ride; }
        return r;
      });
      if (!replaced && ['assigned', 'in_progress'].indexOf(ride.status) !== -1) state.operator.live.unshift(ride);
      clearOperatorRide(ride.id);
      if (['pending', 'assigned', 'in_progress'].indexOf(ride.status) !== -1) drawOperatorRide(ride);
      if (ride.assignedDriverId) {
        upsertOperatorDriverMarker({
          driverId: ride.assignedDriverId,
          fullName: ride.driverName,
          vehicleModel: ride.vehicleModel,
          licensePlate: ride.licensePlate,
          status: 'active',
          location: ride.driverLocation || null
        });
      }
      renderOperatorBoard();
      logEvent(t('ride {id} -> {status}', { id: short(ride.id), status: t(ride.status) }) + (payload.stage ? ' (' + payload.stage + ')' : ''));
      if (payload.stage === 'assigned' || payload.stage === 'reassigned') {
        toast(t('Ride assigned'), (ride.driverName || t('driver')) + ' → ' + (ride.riderName || t('rider')), 'success');
      }
    }
    if (role === 'driver') onDriverRideUpdate(ride, payload);
  }

  function assignRide(rideId, driverId) {
    var session = state.sessions.operator || state.sessions.admin;
    if (!session) { toast(t('Not signed in'), t('Sign in as an operator'), 'error'); return; }
    var socket = session.socket;
    if (!socket) return;
    socket.emit('operator:assign_ride', { ride_id: rideId, driver_id: driverId }, function (ack) {
      if (ack && ack.ok) {
        toast(t('Dispatched'), t('driver {driver} took ride {ride}', { driver: short(driverId), ride: short(rideId) }), 'success');
        logEvent('operator:assign_ride ok ' + short(rideId) + ' -> ' + short(driverId));
      } else if (ack && ack.error) {
        toast(t('Dispatch blocked'), ack.error.message, 'error');
        logEvent(t('assign blocked: {message}', { message: ack.error.message }), true);
      }
    });
  }

  function autoAssign(rideId) {
    var session = state.sessions.operator || state.sessions.admin;
    if (!session || !session.socket) return;
    session.socket.emit('operator:auto_assign', { ride_id: rideId }, function (ack) {
      if (ack && ack.ok) {
        toast('Auto-assigned', 'nearest driver · ' + ack.data.distanceKm + ' km away', 'success');
      } else if (ack && ack.error) {
        toast('Auto-assign failed', ack.error.message, 'error');
      }
    });
  }

  function operatorCancel(rideId) {
    var session = state.sessions.operator || state.sessions.admin;
    if (!session || !session.socket) return;
    session.socket.emit('operator:cancel_ride', { ride_id: rideId, reason: 'operator_cancelled' }, function (ack) {
      if (ack && ack.ok) toast(t('Ride cancelled'), short(rideId), 'warn');
      else if (ack && ack.error) toast(t('Cancel failed'), ack.error.message, 'error');
    });
  }

  /* --------------------------------------------------------- driver logic */
  function onDriverSnapshot(payload) {
    state.driver.profile = payload.driver || null;
    state.driver.history = payload.history || [];
    state.driver.offer = payload.offer || null;
    renderDriverStatus();
    renderDriverOffer();
    renderDriverHistory();
    if (state.driver.profile && state.driver.profile.location) {
      state.driver.lastLocation = state.driver.profile.location;
      setDriverSelfMarker(state.driver.profile.location);
      setText('#dr-coords', 'lat ' + fmt(state.driver.profile.location.lat) + ', lng ' + fmt(state.driver.profile.location.lng));
    }
  }

  function onDriverOffer(payload) {
    state.driver.offer = payload.ride;
    renderDriverOffer();
    toast(t('New ride offer'), (payload.ride.riderName || t('rider')) + ' · ' +
      payload.ride.quote.distanceKm + ' km · ' + money(payload.ride.quote.fare), 'success');
    if (payload.ride.pickup) map.panTo([payload.ride.pickup.lat, payload.ride.pickup.lng]);
    logEvent('driver:ride_offer ' + short(payload.ride.id));
  }

  function onDriverRideUpdate(ride, payload) {
    var me = state.sessions.driver && state.sessions.driver.user.id;
    if (!me) return;
    if (ride.assignedDriverId !== me) {
      if (state.driver.offer && state.driver.offer.id === ride.id) {
        state.driver.offer = null;
        renderDriverOffer();
      }
      return;
    }
    if (ride.status === 'assigned') {
      state.driver.activeRide = ride;
      state.driver.offer = null;
    } else if (ride.status === 'in_progress') {
      state.driver.activeRide = ride;
    } else {
      state.driver.activeRide = null;
      state.driver.offer = null;
      if (ride.status === 'completed') toast(t('Ride completed'), money(ride.quote ? ride.quote.fare : 0), 'success');
      if (ride.status === 'cancelled') toast(t('Ride cancelled'), payload.stage || '', 'error');
      refreshSession('driver');
    }
    renderDriverOffer();
    renderDriverActive(ride, payload ? payload.stage : null);
  }

  function renderDriverStatus() {
    var profile = state.driver.profile;
    if (!profile) return;
    setText('#dr-name', profile.fullName);
    setText('#dr-id', 'driver_id: ' + profile.driverId);
    setText('#dr-badge', t(profile.status));
    $('#dr-badge').className = 'badge ' + profile.status;
    var toggle = $('#dr-toggle');
    if (profile.status === 'offline') {
      toggle.textContent = t('Go online');
      toggle.className = 'btn primary grow';
    } else {
      toggle.textContent = t('Go offline');
      toggle.className = 'btn danger grow';
    }
  }

  function renderDriverOffer() {
    var offer = state.driver.offer;
    if (!offer) { show('#dr-offer', false); return; }
    show('#dr-offer', true);
    setText('#dr-offer-rider', offer.riderName + ' · ' + short(offer.id));
    setText('#dr-offer-pickup', coordText(offer.pickup));
    setText('#dr-offer-dropoff', coordText(offer.dropoff));
    setText('#dr-offer-distance', offer.quote ? offer.quote.distanceKm + ' km · ETA ' + offer.quote.etaMinutes + ' min' : '—');
    setText('#dr-offer-fare', money(offer.quote ? offer.quote.fare : null));
  }

  function renderDriverActive(ride, stage) {
    if (!ride) { show('#dr-active', false); return; }
    show('#dr-active', true);
    setText('#dr-active-rider', (ride.riderName || t('rider')) + ' · ' + short(ride.id));
    setText('#dr-active-stage', t(stage || ride.status));
    $('#dr-active-stage').className = 'badge ' + ride.status;
    $('#dr-arrived').disabled = ride.status !== 'assigned';
    $('#dr-start').disabled = ride.status !== 'assigned';
    $('#dr-complete').disabled = ride.status !== 'in_progress';
    $('#dr-cancel').disabled = ride.status !== 'assigned';
    if (ride.pickup) map.panTo([ride.pickup.lat, ride.pickup.lng]);
  }

  function renderDriverHistory() {
    var list = $('#dr-history');
    list.innerHTML = '';
    state.driver.history.forEach(function (ride) {
      var item = el('li', 'item done-item');
      item.innerHTML = '<div class="item-head"><span class="item-title">' + esc(ride.status) + '</span>' +
        '<span class="meta">' + (ride.quote ? money(ride.quote.fare) : '') + '</span></div>' +
        '<div class="meta">' + esc(ride.riderName || '') + ' · ' + coordText(ride.pickup) + '</div>';
      list.appendChild(item);
    });
    if (!state.driver.history.length) list.appendChild(el('li', 'hint', 'No rides yet.'));
  }

  function driverEmit(event, payload) {
    var session = state.sessions.driver;
    if (!session || !session.socket) return Promise.reject(new Error('not connected'));
    return new Promise(function (resolve) {
      session.socket.emit(event, payload || {}, function (ack) { resolve(ack || { ok: false }); });
    });
  }

  function toggleDriverOnline() {
    var target = state.driver.profile && state.driver.profile.status === 'offline' ? 'online' : 'offline';
    driverEmit('driver:status_change', { status: target }).then(function (ack) {
      if (ack.ok) {
        state.driver.profile = Object.assign({}, state.driver.profile, { status: ack.data.status });
        renderDriverStatus();
        toast(t('Driver') + ' · ' + t(ack.data.status), t('status broadcast to the dispatch floor'), 'success');
        logEvent('driver:status_change -> ' + ack.data.status);
        if (ack.data.status === 'offline') stopDeviceGps();
      } else {
        toast(t('Rejected'), ack.error ? ack.error.message : t('unknown'), 'error');
      }
    });
  }

  function sendGps(lat, lng) {
    return driverEmit('driver:location_update', { lat: lat, lng: lng }).then(function (ack) {
      if (ack.ok) {
        state.driver.lastLocation = { lat: lat, lng: lng };
        setDriverSelfMarker({ lat: lat, lng: lng });
        setText('#dr-coords', 'lat ' + fmt(lat) + ', lng ' + fmt(lng));
      } else if (ack.error) {
        logEvent(t('gps rejected: {message}', { message: ack.error.message }), true);
        if (ack.error.code === 'CONFLICT') stopDeviceGps();
      }
      return ack;
    });
  }

  function useDeviceGps() {
    if (!navigator.geolocation) { toast(t('Unsupported'), t('No Geolocation API in this browser'), 'error'); return; }
    if (!state.driver.profile || state.driver.profile.status === 'offline') {
      toast(t('Offline'), t('Go online before streaming GPS'), 'warn');
      return;
    }
    if (state.driver.watchId !== null) {
      stopDeviceGps();
      return;
    }
    state.driver.watchId = navigator.geolocation.watchPosition(function (pos) {
      sendGps(pos.coords.latitude, pos.coords.longitude);
    }, function (err) {
      toast(t('GPS error'), err.message, 'error');
    }, { enableHighAccuracy: true, maximumAge: 2000 });
    setText('#dr-real-gps', t('Stop GPS tracking'));
    logEvent(t('device GPS watch attached'));
  }

  function stopDeviceGps() {
    if (state.driver.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(state.driver.watchId);
      state.driver.watchId = null;
    }
    setText('#dr-real-gps', t('Use device GPS'));
  }

  /* ---------------------------------------------------------- admin logic */
  function loadAdminOverview() {
    var session = state.sessions.admin;
    if (!session) return;
    api('/api/admin/overview', { token: session.token }).then(function (data) {
      var applications = state.admin.overview && state.admin.overview.applications;
      state.admin.overview = Object.assign({}, data, applications ? { applications: applications } : {});
      renderAdminStats();
      renderAdminTable();
    }).catch(function (err) {
      toast(t('Admin overview failed'), err.message, 'error');
    });
  }

  function renderAdminStats() {
    var data = state.admin.overview;
    var box = $('#ad-stats');
    if (!data) { box.innerHTML = ''; return; }
    var cells = [];
    (data.stats.users || []).forEach(function (row) {
      cells.push({ label: t(row.role), value: row.total });
    });
    (data.stats.rides || []).forEach(function (row) {
      cells.push({ label: t('rides {status}', { status: t(row.status) }), value: row.total });
    });
    cells.push({ label: t('sockets'), value: data.sockets ? data.sockets.connected : 0 });
    box.innerHTML = '';
    cells.forEach(function (cell) {
      var node = el('div', 'stat', '<b></b><span></span>');
      node.querySelector('b').textContent = cell.value;
      node.querySelector('span').textContent = cell.label;
      box.appendChild(node);
    });
  }

  var TABLES = {
    users: {
      columns: ['name', 'phone', 'role', 'id', ''],
      render: function (u) {
        return [
          esc(u.full_name),
          '<span class="mono">' + esc(u.phone_number) + '</span>',
          '<span class="badge ' + u.role + '">' + esc(t(u.role)) + '</span>',
          '<span class="mono">' + short(u.id) + '</span>',
          '<button class="btn small danger" data-del="' + u.id + '">' + t('Delete') + '</button>'
        ];
      },
      rows: function (data) { return data.users || []; }
    },
    drivers: {
      columns: ['driver', 'vehicle', 'plate', 'status', 'position', 'id'],
      render: function (d) {
        return [
          esc(d.fullName),
          esc(d.vehicleModel || ''),
          '<span class="mono">' + esc(d.licensePlate || '') + '</span>',
          '<span class="badge ' + d.status + '">' + esc(t(d.status)) + '</span>',
          '<span class="mono">' + (d.location ? coordText(d.location) : '—') + '</span>',
          '<span class="mono">' + short(d.driverId) + '</span>'
        ];
      },
      rows: function (data) { return data.drivers || []; }
    },
    rides: {
      columns: ['status', 'rider', 'driver', 'operator', 'route', 'id', ''],
      render: function (r) {
        return [
          '<span class="badge ' + r.status + '">' + esc(t(r.status)) + '</span>',
          esc(r.riderName || ''),
          esc(r.driverName || '—'),
          esc(r.operatorName || '—'),
          '<span class="mono">' + coordText(r.pickup) + ' → ' + coordText(r.dropoff) + '</span>',
          '<span class="mono">' + short(r.id) + '</span>',
          (['pending', 'assigned'].indexOf(r.status) !== -1
            ? '<button class="btn small danger" data-cancel-ride="' + r.id + '">' + t('Cancel') + '</button>'
            : '')
        ];
      },
      rows: function (data) { return data.rides || []; }
    },
    logs: {
      columns: ['time', 'level', 'event', 'actor', 'entity', 'details'],
      render: function (l) {
        return [
          '<span class="mono">' + new Date(l.created_at).toLocaleTimeString() + '</span>',
          '<span class="badge ' + (l.level === 'error' ? 'cancelled' : l.level === 'warn' ? 'pending' : 'assigned') + '">' + esc(t(l.level)) + '</span>',
          esc(l.event),
          esc(l.actor_name || l.actor_role || t('system')),
          '<span class="mono">' + short(l.entity_id) + '</span>',
          '<span class="mono">' + esc(JSON.stringify(l.details || {})).slice(0, 70) + '</span>'
        ];
      },
      rows: function (data) { return data.logs || []; }
    },
    applications: {
      columns: ['time', 'applicant', 'phone', 'vehicle', 'plate', 'note', 'status', 'actions'],
      render: function (l) {
        var d = l.details || {};
        var status = l.status || 'pending';
        var actions = status === 'pending'
          ? '<button class="btn small primary" data-application-id="' + esc(l.id) + '" data-application-decision="accepted">' +
              t('Accept application') + '</button> ' +
            '<button class="btn small danger" data-application-id="' + esc(l.id) + '" data-application-decision="rejected">' +
              t('Reject application') + '</button>'
          : '';
        return [
          '<span class="mono">' + new Date(l.created_at).toLocaleString() + '</span>',
          esc(d.fullName || l.actor_name || '—'),
          '<span class="mono">' + esc(d.phoneNumber || '') + '</span>',
          esc(d.vehicleModel || ''),
          '<span class="mono">' + esc(d.licensePlate || '') + '</span>',
          esc(d.note || ''),
          '<span class="badge ' + (status === 'accepted' ? 'assigned' : status === 'rejected' ? 'cancelled' : 'pending') + '">' +
            esc(t(status)) + '</span>',
          actions
        ];
      },
      rows: function (data) { return data.applications || []; }
    }
  };

  /** Driver applications live in the audit trail (event = driver.application). */
  function loadDriverApplications() {
    var session = state.sessions.admin;
    if (!session) return;
    api('/api/admin/applications', { token: session.token })
      .then(function (data) {
        if (!state.admin.overview) state.admin.overview = {};
        state.admin.overview.applications = data.applications || [];
        renderAdminTable();
      })
      .catch(function (err) { toast(t('Applications failed'), err.message, 'error'); });
  }

  function decideDriverApplication(applicationId, decision) {
    var session = state.sessions.admin;
    if (!session) return;
    var confirmMessage = decision === 'accepted'
      ? t('Accept this application? The rider account will become a driver account.')
      : t('Reject this driver application?');
    if (!window.confirm(confirmMessage)) return;
    $all('[data-application-id]').forEach(function (button) {
      if (button.getAttribute('data-application-id') === applicationId) {
        button.disabled = true;
      }
    });
    api('/api/admin/applications/' + encodeURIComponent(applicationId) + '/decision', {
      method: 'POST',
      token: session.token,
      body: { decision: decision }
    }).then(function () {
      toast(
        decision === 'accepted' ? t('Application accepted') : t('Application rejected'),
        decision === 'accepted'
          ? t('The applicant must sign out and sign in again to access the Driver console.')
          : t('The rider account remains unchanged.'),
        decision === 'accepted' ? 'success' : 'warn'
      );
      loadAdminOverview();
      loadDriverApplications();
    }).catch(function (err) {
      toast(t('Application review failed'), err.message, 'error');
      $all('[data-application-id]').forEach(function (button) {
        if (button.getAttribute('data-application-id') === applicationId) {
          button.disabled = false;
        }
      });
      loadDriverApplications();
    });
  }

  function renderAdminTable() {
    var data = state.admin.overview;
    if (!data) return;
    var conf = TABLES[state.admin.table];
    var head = $('#ad-thead');
    var body = $('#ad-tbody');
    head.innerHTML = '<tr>' + conf.columns.map(function (c) {
      return '<th>' + esc(tOr('col.' + c, c)) + '</th>';
    }).join('') + '</tr>';
    body.innerHTML = '';
    var rows = conf.rows(data);
    if (!rows.length) {
      var emptyRow = el('tr');
      emptyRow.innerHTML = '<td colspan="' + conf.columns.length + '" class="table-empty">' +
        esc(t('No records to show')) + '</td>';
      body.appendChild(emptyRow);
      return;
    }
    rows.forEach(function (row) {
      var tr = el('tr');
      tr.innerHTML = conf.render(row).map(function (cell) { return '<td>' + cell + '</td>'; }).join('');
      body.appendChild(tr);
    });
  }

  /* -------------------------------------------------------- session cards */
  function renderSessionUI(role) {
    var prefixes = { user: 'rider', operator: 'op', driver: 'dr', admin: 'ad' };
    var prefix = prefixes[role];
    var session = state.sessions[role];
    show('#' + prefix + '-session', !!session);
    if (!session) return;
    if (role === 'user') {
      setText('#rider-name', session.user.fullName);
      renderRiderRide(null);
      renderRiderHistory();
    }
    if (role === 'operator') setText('#op-name', session.user.fullName);
    if (role === 'driver') {
      renderDriverStatus();
      show('#dr-offer', false);
      show('#dr-active', false);
    }
    if (role === 'admin') setText('#ad-name', session.user.fullName);
  }

  /* -------------------------------------------------------------- routing */
  /* One hash-based router drives the pages: the home landing page plus a
     dedicated console page per role (#/rider, #/driver, #/operator, #/admin). */
  var ROUTES = { '/': 'home', '/rider': 'user', '/driver': 'driver', '/operator': 'operator', '/admin': 'admin' };
  var ROLE_ROUTES = { user: '/rider', driver: '/driver', operator: '/operator', admin: '/admin' };

  function updateRoleAccessUI() {
    var roles = Object.keys(state.sessions);
    var hasSession = roles.length > 0;
    var userSession = !!state.sessions.user;
    headerAccountRole = state.sessions[state.role] ? state.role : (roles[0] || null);
    var activeSession = headerAccountRole ? state.sessions[headerAccountRole] : null;

    show('#auth-actions', !activeSession);
    show('#account-actions', !!activeSession);
    show('#open-signup', !activeSession);
    if (activeSession) {
      var firstName = String(activeSession.user.fullName || '').trim().split(/\s+/)[0];
      setText('#account-first-name', firstName);
    }
    $all('.role-tab').forEach(function (tab) {
      var role = tab.getAttribute('data-role');
      showElement(tab, hasSession && (role === 'user' ? true : !!state.sessions[role]));
    });
    $all('[data-console-role]').forEach(function (card) {
      var role = card.getAttribute('data-console-role');
      showElement(card, !hasSession || role === 'user' || !!state.sessions[role]);
    });
    show('#console-directory', true);
    $all('.panel').forEach(function (panel) {
      panel.classList.toggle('is-auth-only', !hasSession);
    });
    var consoleLayout = $('#console-layout');
    if (consoleLayout) consoleLayout.classList.toggle('is-auth-only', !hasSession);
    var mapWrap = $('.map-wrap');
    if (mapWrap) mapWrap.classList.toggle('is-auth-only', !hasSession);
    var eventLog = $('.log-card');
    if (eventLog) eventLog.classList.toggle('is-auth-only', !hasSession);
    ['#hero-become-driver', '#home-become-driver', '#rider-become-driver'].forEach(function (selector) {
      show(selector, !hasSession || userSession);
    });
  }

  function showElement(node, visible) {
    if (node) node.classList.toggle('hidden', !visible);
  }

  function selectAuthRole(role) {
    authRole = role;
    $all('[data-auth-role]').forEach(function (button) {
      var active = button.getAttribute('data-auth-role') === role;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $all('[data-login-role]').forEach(function (form) {
      form.classList.toggle('hidden', form.getAttribute('data-login-role') !== role);
    });
  }

  function setAuthMode(mode) {
    var isSignup = mode === 'signup';
    show('#auth-login-content', !isSignup);
    show('#rider-signup-form', isSignup);
    show('.auth-role-tabs', !isSignup);
    $('#auth-login-mode').classList.toggle('is-active', !isSignup);
    $('#auth-signup-mode').classList.toggle('is-active', isSignup);
    $('#auth-login-mode').setAttribute('aria-selected', String(!isSignup));
    $('#auth-signup-mode').setAttribute('aria-selected', String(isSignup));
    setText('#auth-title', isSignup ? 'Create your rider account' : 'Welcome to TBRide');
    setText('#auth-description', isSignup
      ? 'Sign up to request and manage your rides.'
      : 'Log in to continue to your console.');
  }

  function openAuthModal(mode, role) {
    selectAuthRole(role || state.role || 'user');
    setAuthMode(mode || 'login');
    show('#auth-modal', true);
    var selector = mode === 'signup' ? '#rider-signup-name' : '#' + ({
      user: 'rider-phone', driver: 'dr-phone', operator: 'op-phone', admin: 'ad-phone'
    }[authRole] || 'rider-phone');
    window.setTimeout(function () {
      var input = $(selector);
      if (input) input.focus();
    }, 40);
  }

  function closeAuthModal() {
    show('#auth-modal', false);
  }

  function fallbackRoute() {
    var preference = ['user', 'driver', 'operator', 'admin'];
    for (var i = 0; i < preference.length; i++) {
      if (state.sessions[preference[i]]) return ROLE_ROUTES[preference[i]];
    }
    return '/';
  }

  function routeForHash() {
    var hash = String(window.location.hash || '').replace(/^#/, '');
    return ROUTES[hash] ? hash : '/';
  }

  function navigate() {
    var route = routeForHash();
    var page = ROUTES[route];
    var hasSession = Object.keys(state.sessions).length > 0;
    if (page !== 'home' && hasSession &&
        !(page === 'user' || state.sessions[page])) {
      route = fallbackRoute();
      page = ROUTES[route];
      if (window.location.hash !== '#' + route) window.location.hash = route;
    }
    var isHome = page === 'home';

    updateRoleAccessUI();
    $all('.nav-link').forEach(function (link) {
      link.classList.toggle('is-active', link.getAttribute('data-page') === page);
    });
    if (isHome) {
      $all('.role-tab').forEach(function (link) { link.classList.remove('is-active'); });
    }

    show('#page-home', isHome);
    show('#console-layout', !isHome);

    if (!isHome) {
      switchRole(page);
      // Leaflet cannot measure a container that was display:none.
      window.setTimeout(function () { if (map) map.invalidateSize(); }, 60);
    }
  }

  function go(route) {
    var target = '#' + route;
    if (window.location.hash === target) navigate();
    else window.location.hash = target;
  }

  /* ------------------------------------------------------------- wiring */
  function switchRole(role) {
    state.role = role;
    updateRoleAccessUI();
    $all('.role-tab').forEach(function (tab) { tab.classList.toggle('is-active', tab.getAttribute('data-role') === role); });
    $all('.panel').forEach(function (panel) {
      panel.classList.toggle('is-active', panel.id === 'panel-' + role);
    });
    applyRoleToMap();
    setConnection(state.sessions[role] ? 'on' : '',
      state.sessions[role] ? t('live · {role}', { role: role }) : t('idle'));
    if (role === 'operator' || role === 'admin') {
      var session = state.sessions[role] || state.sessions.operator || state.sessions.admin;
      if (session && session.socket) {
        session.socket.emit('operator:snapshot_request', {}, function (ack) {
          if (ack && ack.ok) onOperatorSnapshot(ack.data);
        });
      }
    }
  }

  /* ------------------------------------------------- become a driver flow */
  function openApplyModal() {
    var session = state.sessions.user;
    if (!session) {
      toast(t('Sign in first'), t('Sign in as a rider to apply as a driver'), 'warn');
      openAuthModal('login', 'user');
      return;
    }
    $('#apply-name').value = (session.user && session.user.fullName) || '';
    $('#apply-phone').value = (session.user && session.user.phoneNumber) || '';
    show('#apply-modal', true);
    window.setTimeout(function () { var v = $('#apply-vehicle'); if (v) v.focus(); }, 60);
  }

  function closeApplyModal() {
    var modal = $('#apply-modal');
    if (modal && !modal.classList.contains('hidden')) show('#apply-modal', false);
  }

  function submitDriverApplication(e) {
    e.preventDefault();
    var session = state.sessions.user;
    if (!session) {
      closeApplyModal();
      toast(t('Sign in first'), t('Sign in as a rider to apply as a driver'), 'warn');
      return;
    }
    api('/api/driver-applications', {
      method: 'POST',
      token: session.token,
      body: {
        full_name: $('#apply-name').value.trim(),
        phone_number: $('#apply-phone').value.trim(),
        vehicle_model: $('#apply-vehicle').value.trim(),
        license_plate: $('#apply-plate').value.trim(),
        note: $('#apply-note').value.trim()
      }
    }).then(function () {
      closeApplyModal();
      $('#apply-form').reset();
      toast(t('Application sent'), t('The operators will review your application and contact you soon.'), 'success');
      logEvent(t('driver application sent'));
    }).catch(function (err) {
      toast(t('Application failed'), err.message, 'error');
    });
  }

  function bindEvents() {
    // hash routing: nav links are anchors, so the browser drives the router.
    $all('.nav-link').forEach(function (link) {
      link.addEventListener('click', function (e) {
        var href = link.getAttribute('href');
        if (!href || href.charAt(0) !== '#') return;
        e.preventDefault();
        go(href.slice(1));
      });
    });
    window.addEventListener('hashchange', navigate);
    window.addEventListener('storage', function (event) {
      if (!event.key || event.key.indexOf(SESSION_STORAGE_PREFIX) !== 0) return;
      var role = event.key.slice(SESSION_STORAGE_PREFIX.length);
      if (['user', 'driver', 'operator', 'admin'].indexOf(role) === -1) return;
      if (event.newValue) restoreSession(role, event.newValue);
      else if (state.sessions[role]) logout(role, true);
    });

    $('#open-login').addEventListener('click', function () {
      openAuthModal('login', state.role);
    });
    $('#open-signup').addEventListener('click', function () {
      openAuthModal('signup', 'user');
    });
    $('#auth-close').addEventListener('click', closeAuthModal);
    $('#auth-modal').addEventListener('click', function (e) {
      if (e.target === $('#auth-modal')) closeAuthModal();
    });
    $('#auth-login-mode').addEventListener('click', function () {
      setAuthMode('login');
      selectAuthRole(authRole);
    });
    $('#auth-signup-mode').addEventListener('click', function () {
      setAuthMode('signup');
    });
    $all('[data-auth-role]').forEach(function (button) {
      button.addEventListener('click', function () {
        selectAuthRole(button.getAttribute('data-auth-role'));
      });
    });

    // language switch
    $all('.lang-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (window.I18N) window.I18N.setLang(btn.getAttribute('data-lang'));
      });
    });

    // become a driver
    ['#rider-become-driver', '#hero-become-driver', '#home-become-driver'].forEach(function (sel) {
      var node = $(sel);
      if (node) node.addEventListener('click', openApplyModal);
    });
    $('#apply-cancel').addEventListener('click', closeApplyModal);
    $('#apply-modal').addEventListener('click', function (e) {
      if (e.target === $('#apply-modal')) closeApplyModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeApplyModal();
        closeAuthModal();
      }
    });
    $('#apply-form').addEventListener('submit', submitDriverApplication);

    $('#header-signout').addEventListener('click', function () {
      if (headerAccountRole) logout(headerAccountRole);
    });

    // logins
    $('#rider-login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      login('user', $('#rider-phone').value.trim(), $('#rider-password').value);
    });
    $('#rider-signup-form').addEventListener('submit', function (e) {
      e.preventDefault();
      signupRider($('#rider-signup-name').value.trim(), $('#rider-signup-phone').value.trim(), $('#rider-signup-password').value);
    });
    $('#op-login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      login('operator', $('#op-phone').value.trim(), $('#op-password').value);
    });
    $('#dr-login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      login('driver', $('#dr-phone').value.trim(), $('#dr-password').value);
    });
    $('#ad-login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      login('admin', $('#ad-phone').value.trim(), $('#ad-password').value);
    });

    // rider
    $('#rider-request-btn').addEventListener('click', requestRide);
    $('#rider-cancel-btn').addEventListener('click', cancelRide);
    $('#rider-mode-pickup').addEventListener('click', function () {
      state.rider.mode = 'pickup';
      $('#rider-mode-pickup').className = 'btn small primary';
      $('#rider-mode-dropoff').className = 'btn small';
      toast(t('Pickup mode'), t('Tap the map to move the pickup marker'), '');
    });
    $('#rider-mode-dropoff').addEventListener('click', function () {
      state.rider.mode = 'dropoff';
      $('#rider-mode-dropoff').className = 'btn small primary';
      $('#rider-mode-pickup').className = 'btn small';
      toast(t('Destination mode'), t('Tap the map to move the destination marker'), '');
    });

    // driver
    $('#dr-toggle').addEventListener('click', toggleDriverOnline);
    $('#dr-real-gps').addEventListener('click', useDeviceGps);
    $('#dr-send-location').addEventListener('click', function () {
      if (!navigator.geolocation) {
        toast(t('Unsupported'), t('No Geolocation API in this browser'), 'error');
        return;
      }
      navigator.geolocation.getCurrentPosition(function (pos) {
        sendGps(pos.coords.latitude, pos.coords.longitude);
      }, function (err) {
        toast(t('GPS error'), err.message, 'error');
      }, { enableHighAccuracy: true, maximumAge: 2000 });
    });

    $('#dr-accept').addEventListener('click', function () {
      if (!state.driver.offer) return;
      driverEmit('driver:accept_ride', { ride_id: state.driver.offer.id }).then(function (ack) {
        if (ack.ok) {
          state.driver.activeRide = ack.data.ride;
          state.driver.offer = null;
          renderDriverOffer();
          renderDriverActive(ack.data.ride, 'accepted');
          toast(t('Ride accepted'), t('you are now active'), 'success');
        } else if (ack.error) toast(t('Accept failed'), ack.error.message, 'error');
      });
    });
    $('#dr-decline').addEventListener('click', function () {
      if (!state.driver.offer) return;
      driverEmit('driver:decline_ride', { ride_id: state.driver.offer.id, reason: 'driver_declined' }).then(function (ack) {
        if (ack.ok) { state.driver.offer = null; renderDriverOffer(); toast(t('Declined'), t('ride stays pending'), 'warn'); }
      });
    });
    $('#dr-arrived').addEventListener('click', function () {
      if (!state.driver.activeRide) return;
      driverEmit('driver:arrived', { ride_id: state.driver.activeRide.id }).then(function (ack) {
        if (ack.ok) { setText('#dr-active-stage', t('arrived')); toast(t('Arrived'), t('rider notified'), 'success'); }
      });
    });
    $('#dr-start').addEventListener('click', function () {
      if (!state.driver.activeRide) return;
      driverEmit('driver:start_ride', { ride_id: state.driver.activeRide.id }).then(function (ack) {
        if (ack.ok) { state.driver.activeRide = ack.data.ride; renderDriverActive(ack.data.ride, 'in_progress'); }
        else if (ack.error) toast(t('Start failed'), ack.error.message, 'error');
      });
    });
    $('#dr-complete').addEventListener('click', function () {
      if (!state.driver.activeRide) return;
      driverEmit('driver:complete_ride', { ride_id: state.driver.activeRide.id }).then(function (ack) {
        if (ack.ok) {
          state.driver.activeRide = null;
          renderDriverActive(null);
          show('#dr-active', false);
          toast(t('Ride completed'), t('driver back online'), 'success');
          refreshSession('driver');
        } else if (ack.error) toast(t('Complete failed'), ack.error.message, 'error');
      });
    });
    $('#dr-cancel').addEventListener('click', function () {
      if (!state.driver.activeRide) return;
      driverEmit('user:cancel_ride', { ride_id: state.driver.activeRide.id, reason: 'driver_cancelled' }).then(function (ack) {
        if (ack.ok) { state.driver.activeRide = null; renderDriverActive(null); show('#dr-active', false); refreshSession('driver'); }
      });
    });

    // admin
    $all('.subtab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        state.admin.table = tab.getAttribute('data-table');
        $all('.subtab').forEach(function (other) { other.classList.toggle('is-active', other === tab); });
        if (state.admin.table === 'applications') loadDriverApplications();
        else renderAdminTable();
      });
    });
    $('#ad-tbody').addEventListener('click', function (e) {
      var del = e.target.getAttribute && e.target.getAttribute('data-del');
      var cancel = e.target.getAttribute && e.target.getAttribute('data-cancel-ride');
      var applicationId = e.target.getAttribute && e.target.getAttribute('data-application-id');
      var applicationDecision = e.target.getAttribute && e.target.getAttribute('data-application-decision');
      var session = state.sessions.admin;
      if (!session) return;
      if (applicationId && ['accepted', 'rejected'].indexOf(applicationDecision) !== -1) {
        decideDriverApplication(applicationId, applicationDecision);
        return;
      }
      if (del) {
        if (!window.confirm(t('Delete this account? Related rides keep their history.'))) return;
        api('/api/admin/users/' + del, { method: 'DELETE', token: session.token })
          .then(function () { toast(t('Deleted'), short(del), 'warn'); loadAdminOverview(); })
          .catch(function (err) { toast(t('Delete failed'), err.message, 'error'); });
      }
      if (cancel) {
        api('/api/admin/rides/' + cancel + '/cancel', { method: 'POST', token: session.token, body: {} })
          .then(function () { toast(t('Ride cancelled'), short(cancel), 'warn'); loadAdminOverview(); })
          .catch(function (err) { toast(t('Cancel failed'), err.message, 'error'); });
      }
    });
    $('#ad-create-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var session = state.sessions.admin;
      if (!session) return;
      var role = $('#ad-new-role').value;
      var body = {
        full_name: $('#ad-new-name').value.trim(),
        phone_number: $('#ad-new-phone').value.trim(),
        password: $('#ad-new-password').value,
        role: role
      };
      if (role === 'driver') {
        body.vehicle_model = $('#ad-new-vehicle').value.trim();
        body.license_plate = $('#ad-new-plate').value.trim();
      }
      api('/api/admin/users', { method: 'POST', token: session.token, body: body })
        .then(function () {
          toast(t('Account created'), body.full_name + ' · ' + role, 'success');
          $('#ad-create-form').reset();
          loadAdminOverview();
        })
        .catch(function (err) { toast(t('Create failed'), err.message, 'error'); });
    });

    // map drag & drop targets (native HTML5 DnD over the Leaflet container)
    var mapEl = $('#map');
    mapEl.addEventListener('dragover', function (e) {
      if (!state.operator.selectedRideId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      var driverId = nearestDriverMarker(e.clientX, e.clientY);
      clearDropHighlight();
      if (driverId && opDriverMarkers[driverId] && opDriverMarkers[driverId]._icon) {
        opDriverMarkers[driverId]._icon.classList.add('drop-target');
        state.operator.dropTargetDriverId = driverId;
      } else {
        state.operator.dropTargetDriverId = null;
      }
    });
    mapEl.addEventListener('dragleave', function () { clearDropHighlight(); });
    mapEl.addEventListener('drop', function (e) {
      if (!state.operator.selectedRideId) return;
      e.preventDefault();
      var data = parseDragData(e);
      var driverId = state.operator.dropTargetDriverId || nearestDriverMarker(e.clientX, e.clientY);
      clearDropHighlight();
      $('#drop-overlay').classList.remove('show');
      if (!data || !driverId) {
        toast(t('Drop on a driver'), t('No driver marker near the drop point'), 'warn');
        return;
      }
      assignRide(data.rideId, driverId);
      armRideCard(null);
    });
  }

  /* ---------------------------------------------------------------- boot */
  function updateHealth() {
    fetch('/api/health').then(function (r) { return r.json(); }).then(function (body) {
      if (state.sessions[state.role]) setConnection('on', t('live · {role}', { role: state.role }));
      else if (body.ok) setConnection('on', t('backend online'));
      else setConnection('off', t('backend down'));
    }).catch(function () { setConnection('off', t('backend unreachable')); });
  }

  /** Re-render everything that carries translated text. */
  function rerenderForLanguage() {
    renderRiderHistory();
    renderRiderRide(state.rider.activeRide);
    renderOperatorBoard();
    renderDriverStatus();
    renderDriverOffer();
    renderDriverActive(state.driver.activeRide, null);
    if (state.admin.overview) { renderAdminStats(); renderAdminTable(); }
    updateHealth();
    logEvent(t('Language changed'));
  }

  function boot() {
    initMap();
    refreshRiderEstimate();
    bindEvents();
    if (window.I18N) window.I18N.onChange(rerenderForLanguage);
    setConnection('', t('connecting…'));
    navigate();
    logEvent(t('TBRide client ready · sign in or create a rider account'));
    restoreSavedSessions();
    // keep the health indicator honest
    updateHealth();
    setInterval(updateHealth, 15000);
  }

  document.addEventListener('DOMContentLoaded', boot);
  window.TBRide = { state: state, map: function () { return map; } };
})();
