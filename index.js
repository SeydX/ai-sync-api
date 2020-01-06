var format = require('util').format;
var request = require('request').defaults({jar: true/*, proxy:"http://localhost:8888", strictSSL:false*/}); // use cookies
var WebSocket = require('ws')
var events = require('events');


module.exports = {
  AISyncApi: AISyncApi
}

function AISyncApi(config) {
  this.email = config.email;
  this.password = config.password;
  this.eventEmitter = new events.EventEmitter();

  this.baseURL = 'https://aisync.apps.exosite.io/api:1';
  

  // interested parties in us being logged in
  this._loginCompleteCallbacks = [];
  this._loggedIn = false;

  this.responders = {};
  this.messageID = 1;

  this.connection = null;

}

// /**
//  * Login Process
//  */

 AISyncApi.prototype.login = function(callback) {
   // queue this callback for when we're finished logging in
   if (callback) {
    this._loginCompleteCallbacks.push(callback);
   }
     
   // begin logging in if we're not already doing so
   if (!this._loggingIn) {
     this._loggingIn = true;
     this._beginLogin();
   }
 }

 AISyncApi.prototype._loginComplete = function(err) {
   
   var self = this;
   const url = this.baseURL + '/phone';
   this.connection = new WebSocket(url);

   this.connection.onmessage = (e) => {
     if(e !== undefined) {
      var data = JSON.parse(e.data);
      // console.log(data.id);
      if(this.responders[data.id] !== undefined) {
        this.responders[data.id](data);
        delete this.responders[data.id];
      }
      else {
        if(data.event == 'device_change') {
          self.eventEmitter.emit("device_change", data);
        } else {
          console.log("Unknown event type:");
          console.log(data);
        }
        
      }
     }
    
  }

    this.connection.onopen = () => {
    
      setTimeout(function() {
        self.WSsend({
          "request":"login",
          "data":
            {
              "token": self.token
            }
        }, function(data) {
          self._loggedIn = true;
          self._loginCompleteCallbacks.forEach(function(callback) { callback(err); });
          self._loginCompleteCallbacks = [];
        });
      }, 500);
      
    }
    
    this.connection.onerror = (error) => {
      this._socketOpen = false;
      //todo reopen socket?
      console.log(`WebSocket error: ${error}`)
    }
    
    
 }

AISyncApi.prototype.WSsend = function(json, callbackMethod) {
  var msgID = this.messageID++;
  json.id = msgID;
  this.responders[msgID] = callbackMethod;
  this.connection.send(
    JSON.stringify(json)
  );
}

AISyncApi.prototype.wslog = function(data) {
  console.log(data);
}

AISyncApi.prototype._beginLogin = function() { 

  var url = this.baseURL + "/session";

  var self = this;

  request.post(url, {
      json: {
        "email": self.email,
        "password": self.password
      }
    }, function (err, response, body) {

    if(response.statusCode === 200) {
      this.token = body.token;

      this._loginComplete();

    } else {
      console.log("Got an error");
      console.log(body);
    }


  }.bind(this));
}

AISyncApi.prototype.getDevices = function(callback) {

  if(!this._loggedIn) {
    this.login(function(err) {
      if (err) return callback(null, err);
      this.getDevices(callback);
    }.bind(this));
    return;
  }

  this.WSsend({
    "request": "lst_device"
  }, function(data) {
    callback(data);
  });

}

AISyncApi.prototype.deviceStatus = function(device, callback) {
  if(!this._loggedIn) {
    this.login(function(err) {
      if (err) return callback(null, err);
      this.deviceStatus(callback);
    }.bind(this));
    return;
  }
  
  this.WSsend({
    "request": "get",
    "device": device,
    "data": null
  }, function(data) {
    callback(data);
  })


}

AISyncApi.prototype.fanOnOff = function(device, value, callback) {
  this.WSsend({
    "device": device,
    "request": "set",
    "data": {"H00": value}
  }, function(data) {
    callback(null);
  })
}

AISyncApi.prototype.fanSpeed = function(device, value, callback) {
  this.WSsend({
    "device": device,
    "request": "set",
    "data": {"H02": value}
  }, function(data) {
    callback(null);
  })
}

AISyncApi.prototype.lightOnOff = function(device, value, callback) {
  this.WSsend({
    "device": device,
    "request": "set",
    "data": {"H0B": value}
  }, function(data) {
    callback(null);
  })
}