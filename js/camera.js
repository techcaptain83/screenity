var facingMode = "user";
var cameradevices = [];
var audiodevices = [];
var mediaRecorder = '';
var camerastream;
var micstream;
var output = new MediaStream();
var audioCtx;
var destination;
var micsource;
var cancel = false;
var recording = false;
var newwindow = null;

// Inject video to contain camera stream
var htmlinject = "<video id='injected-video' style='height:100%;position:absolute;transform:translateX(-50%);left:50%;right:0;top:0;bottom:0;background-color:#3f4049' playsinline autoplay muted></video>";
document.body.innerHTML += htmlinject;
var video = document.getElementById("injected-video");

// Video dimensions and settings
var constraints = {
  audio: false,
  video: {width:1920, height:1080}
};

navigator.mediaDevices.getUserMedia(constraints).then(startStreaming).catch(streamingError);
function startStreaming(stream) {
    camerastream = stream;
    
    // Get a list of the available camera and audio devices
    navigator.mediaDevices.enumerateDevices().then(function(devices) {
      devices.forEach(function(device) {
          if (device.kind == "videoinput") {
              cameradevices.push({label:device.label, id:device.deviceId});
          } else if (device.kind == "audioinput") {
              audiodevices.push({label:device.label, id:device.deviceId});
          }
      });
        chrome.runtime.sendMessage({type: "camera-list", devices:cameradevices, audio:audiodevices});
    });
    chrome.runtime.sendMessage({type: "loaded"});
}

function streamingError(error) {
    chrome.runtime.sendMessage({type: "loaded"});
    chrome.runtime.sendMessage({type: "no-camera-access"});
}

// Start recording stream + mic
function startRecording(){
    recording = true;
    audioCtx = new AudioContext();
    destination = audioCtx.createMediaStreamDestination();
    navigator.mediaDevices.getUserMedia({
            audio: true
    }).then(function(mic) {
        // Show recording icon
        chrome.browserAction.setIcon({path: "../assets/extension-icons/logo-32-rec.png"});
        
        // Connect the audio to a MediaStreamDestination to be able to control it without affecting the playback
        micstream = mic;
        micsource = audioCtx.createMediaStreamSource(mic);
        micsource.connect(destination);
        output.addTrack(destination.stream.getAudioTracks()[0]);
        output.addTrack(camerastream.getVideoTracks()[0]);
        mediaRecorder = new MediaRecorder(output, {
            videoBitsPerSecond: 2500000,
            mimeType: 'video/webm;codecs=h264'
        }); 
        
        // Record camera stream
        var recordedBlobs = [];
        mediaRecorder.ondataavailable = event => {
            if (event.data && event.data.size > 0) {
              recordedBlobs.push(event.data);
            }
        };
        
        // When the recording has been stopped
        mediaRecorder.onstop = () => {
            // Show default icon
            chrome.browserAction.setIcon({path: "../assets/extension-icons/logo-32.png"});
            
            chrome.runtime.sendMessage({type: "end-camera-recording"});
            recording = false;
            if (!cancel) {
                newwindow = window.open('../html/videoeditor.html');
                newwindow.recordedBlobs = recordedBlobs;
            }
            camerastream.getTracks().forEach(function(track) {
              track.stop();
            });
            micstream.getTracks().forEach(function(track) {
              track.stop();
            });
        }
        
        // Start recording
        mediaRecorder.start();
    });
}

// Change camera source
function updateCamera(id){
    if (id != "disabled") {
        constraints = {
          audio: false,
          video: {deviceId:id}
        };
        navigator.mediaDevices.getUserMedia(constraints).then(function(stream){
            document.getElementById("injected-video").srcObject = stream;  
        });
    } else {
        constraints = {
          audio: false,
          video: true
        };
        navigator.mediaDevices.getUserMedia(constraints).then(function(stream){
            document.getElementById("injected-video").srcObject = stream;  
        });
    }
}

// Change microphone source
function updateMic(id) {
    micstream.getTracks().forEach(function(track) {
        track.stop();
    });
    navigator.mediaDevices.getUserMedia({
        audio: {deviceId:id}
    }).then(function(mic) {
        micstream = mic;
        micsource = audioCtx.createMediaStreamSource(mic);
        micsource.connect(destination);
    });
}

// Flip camera
chrome.storage.sync.get(['flip'], function(result) {
   if (result.flip) {
       document.getElementById("injected-video").style.transform = "translateX(-50%) scaleX(-1)";
   } 
});

// Change camera source
chrome.storage.sync.get(['camera'], function(result) {
    if (result.camera != 0) {
        updateCamera(result.camera);
    }
});

// Listen for messages
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type == "update-camera") {
        updateCamera(request.id);
    } else if (request.type == "flip-camera") {
        if (request.enabled) {
            document.getElementById("injected-video").style.transform = "translateX(-50%) scaleX(-1)";
        } else {
            document.getElementById("injected-video").style.transform = "translateX(-50%) scaleX(1)";
        }
    } else if (request.type == "camera-record") {
        startRecording();
    } else if (request.type == "mic-switch") {
        if (!request.enable) {
            micsource.disconnect(destination);
        } else {
            micsource.connect(destination);
        }
    } else if (request.type == "pause-camera") {
        mediaRecorder.pause();
    } else if (request.type == "resume-camera") {
        mediaRecorder.resume();
    } else if (request.type == "update-mic") {
        updateMic(request.id);
    } else if (request.type == "stop-save") {
        if (recording) {
            cancel = false;
            mediaRecorder.stop();
        }
    } else if (request.type == "stop-cancel") {
        if (recording) {
            cancel = true;
            mediaRecorder.stop();
        }
    } else if (request.type == "camera-check") {
        updateCamera("disabled");
    }
});