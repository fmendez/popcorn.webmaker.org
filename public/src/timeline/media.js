/* This Source Code Form is subject to the terms of the MIT license
 * If a copy of the MIT license was not distributed with this file, you can
 * obtain one at https://raw.github.com/mozilla/butter/master/LICENSE */

define( [ "core/trackevent", "core/track", "core/eventmanager",
          "./track-container", "util/scrollbars", "./timebar",
          "./status", "./trackhandles", "./super-scrollbar",
          "util/lang", "l10n!/layouts/media-instance.html" ],
  function( TrackEvent, Track, EventManager,
            TrackContainer, Scrollbars, TimeBar,
            Status, TrackHandles, SuperScrollbar,
            LangUtils, MEDIA_INSTANCE_LAYOUT ) {

  var DEFAULT_BOUNDS = [ 0, 1 ];

  function MediaInstance( butter, media ) {

    var _bounds = DEFAULT_BOUNDS;

    function setContainerBounds( left, right ) {
      if ( _bounds[0] !== left || _bounds[1] !== right ) {
        _bounds = [ left, right ];
        _tracksContainer.setViewportBounds( left, right );
        updateUI();
      }
    }

    var _this = this,
        _media = media,
        _rootElement = LangUtils.domFragment( MEDIA_INSTANCE_LAYOUT, ".media-instance" ),
        _tracksContainer = new TrackContainer( butter, media, _rootElement ),
        _container = _rootElement.querySelector( ".media-container" ),
        _superScrollbar = new SuperScrollbar( _tracksContainer.element, _tracksContainer.container, setContainerBounds, _media ),
        _vScrollBar = new Scrollbars.Vertical( _tracksContainer.element, _tracksContainer.container ),
        _hScrollBar = new Scrollbars.Horizontal( _tracksContainer.element, _tracksContainer.container ),
        _timebar = new TimeBar( butter, _media, butter.ui.tray.statusArea, _tracksContainer ),
        _trackHandles = new TrackHandles( butter, _media, _rootElement, _tracksContainer ),
        _status;

    _status = new Status( _media, butter.ui.tray.statusArea );

    _tracksContainer.setScrollbars( _vScrollBar, _hScrollBar );

    EventManager.extend( _this );

    function onEditorToggled() {
      _tracksContainer.update();
      _timebar.update();
      _superScrollbar.resize();
    }

    function onEditorOpened() {
      _tracksContainer.update();
      _timebar.update();
    }

    function onVerticalResize() {
      _vScrollBar.update();
      _timebar.update();
    }

    function onResize() {
      _vScrollBar.update();
      _timebar.update();
      _superScrollbar.resize();
    }

    window.addEventListener( "resize", onResize, false );

    function onMediaTimeUpdate() {
      // Move the viewport to be centered around the scrubber
      _tracksContainer.followCurrentTime();
      // Align the timebar again to remove jitter
      // TODO: this is expensive, and only fixes 50% of the problem
      _timebar.update();
    }

    _media.listen( "mediaplay", function(){
      // Make sure the viewport contains the scrubber
      _tracksContainer.snapTo( _media.currentTime );
      // Listen for timeupdate to attempt to center the viewport around the scrubber
      _media.listen( "mediatimeupdate", onMediaTimeUpdate );
    });

    _media.listen( "mediapause", function(){
      // Stop listening for timeupdates so that the user can scroll around freely
      _media.unlisten( "mediatimeupdate", onMediaTimeUpdate );
    });

    function onTrackEventMouseDown( e ){
      var trackEvent = e.data.trackEvent,
          tracks, i, length,
          wasSelected = trackEvent.selected,
          originalEvent = e.data.originalEvent;

      if ( !originalEvent.shiftKey && !trackEvent.selected ) {
        tracks = _media.tracks;
        for ( i = 0, length = tracks.length; i < length; i++ ) {
          tracks[ i ].deselectEvents( trackEvent );
        }
      }

      trackEvent.selected = true;

      function onTrackEventMouseUp() {
        window.removeEventListener( "mouseup", onTrackEventMouseUp, false );
        window.removeEventListener( "mousemove", onTrackEventDragStarted, false );

        if ( !originalEvent.shiftKey ) {
          tracks = _media.tracks;
          for ( i = 0, length = tracks.length; i < length; i++ ) {
            tracks[ i ].deselectEvents( trackEvent );
          }
        } else if ( trackEvent.selected && wasSelected ) {
          trackEvent.selected = false;
        }
      }

      function onTrackEventDragStarted() {
        window.removeEventListener( "mousemove", onTrackEventDragStarted, false );
        window.removeEventListener( "mouseup", onTrackEventMouseUp, false );
      }

      window.addEventListener( "mouseup", onTrackEventMouseUp, false );
      window.addEventListener( "mousemove", onTrackEventDragStarted, false );
    }

    function onTrackEventDeselected( e ) {
      butter.editor.closeTrackEventEditor( e.target );
    }

    function onMediaReady(){
      updateUI();
      _timebar.ready();
      _media.currentTime = 0;
    }

    function onMediaReadyFirst(){
      _media.unlisten( "mediaready", onMediaReadyFirst );
      _media.listen( "mediaready", onMediaReady );

      _container.appendChild( _tracksContainer.element );
      _rootElement.appendChild( _superScrollbar.element );
      _container.appendChild( _vScrollBar.element );
      _container.appendChild( _hScrollBar.element );
      _rootElement.appendChild( _trackHandles.element );

      butter.ui.tray.setMediaInstance( _rootElement );

      function onTrackEventAdded( e ){
        var trackEvent = e.data;
        function onTrackEventClicked() {
          butter.editor.editTrackEvent( trackEvent );
        }

        _media.listen( "trackeventremoved", function( e ){
          var trackEvent = e.data;
          trackEvent.view.unlisten( "trackeventmousedown", onTrackEventMouseDown );
          trackEvent.view.element.removeEventListener( "mousedown", onTrackEventClicked, false );
          trackEvent.unlisten( "trackeventdeselected", onTrackEventDeselected );
        });

        trackEvent.view.listen( "trackeventmousedown", onTrackEventMouseDown );
        trackEvent.view.element.addEventListener( "mousedown", onTrackEventClicked, false );
        trackEvent.listen( "trackeventdeselected", onTrackEventDeselected );
      }

      function onTrackAdded( e ){
        var track = e.data;
        track.view.listen( "plugindropped", onPluginDropped );
        track.view.listen( "trackeventmousedown", onTrackEventMouseDown );

        var existingEvents = track.trackEvents;
        for( var i=0; i<existingEvents.length; ++i ){
          onTrackEventAdded({
            data: existingEvents[ i ]
          });
        }

      }

      var existingTracks = _media.tracks;
      for( var i=0; i<existingTracks.length; ++i ){
        onTrackAdded({
          data: existingTracks[ i ]
        });
      }

      _media.listen( "trackadded", onTrackAdded );
      _media.listen( "trackeventadded", onTrackEventAdded );

      _media.listen( "trackremoved", function( e ){
        var track = e.data;
        track.view.unlisten( "plugindropped", onPluginDropped );
        track.view.unlisten( "trackeventmousedown", onTrackEventMouseDown );
      });

      _superScrollbar.initialize();
      _bounds = DEFAULT_BOUNDS;
      _tracksContainer.setViewportBounds( _bounds[ 0 ], _bounds[ 1 ] );
      onMediaReady();
    }

    _media.listen( "mediaready", onMediaReadyFirst );

    butter.editor.listen( "editortoggled", onEditorToggled );
    butter.listen( "editoropened", onEditorOpened );

    function onPluginDropped( e ) {
      var type = e.data.type,
          track = e.data.track,
          start = e.data.start,
          end = e.data.end,
          popcornOptions = {};

      popcornOptions.start = start;
      popcornOptions.end = end;

      if ( e.data.popcornOptions ) {
        for ( var prop in e.data.popcornOptions ) {
          if ( e.data.popcornOptions.hasOwnProperty( prop ) ) {
            popcornOptions[ prop ] = e.data.popcornOptions[ prop ];
          }
        }
      }

      function addCallback( trackEvent ) {
        butter.editor.editTrackEvent( trackEvent );
      }

      if ( _media.ready ) {
        if ( popcornOptions && popcornOptions.end ) {
          popcornOptions.end = popcornOptions.end + start;
        }
        butter.deselectAllTrackEvents();
        butter.generateSafeTrackEvent({
          type: type,
          popcornOptions: popcornOptions,
          track: track
        }, addCallback );
      }
    }

    this.hide = function() {
      _rootElement.style.display = "none";
    };

    this.show = function() {
      _rootElement.style.display = "block";
    };

    function updateUI() {
      if( _media.duration ){
        _tracksContainer.update();
        _timebar.update();
        _vScrollBar.update();
        _superScrollbar.update();
        _trackHandles.update();
      }
    }

    butter.listen( "ready", function(){
      updateUI();
    });

    this.trackContainer = _tracksContainer;
    this.element = _rootElement;
    this.media = _media;
    this.verticalResize = onVerticalResize;
  }

  return MediaInstance;

});

