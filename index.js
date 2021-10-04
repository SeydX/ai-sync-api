const debug = require('debug')('aisync:api');
const events = require('events');
const request = require('request').defaults({ jar: true /*, proxy:"http://localhost:8888", strictSSL:false*/ }); // use cookies
const WebSocket = require('ws');

module.exports = {
  AISyncApi: AISyncApi,
};

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
  this.openedSocket = null;
  this.timeInterval = 10000;
}

// /**
//  * Login Process
//  */

AISyncApi.prototype.login = function (callback) {
  // queue this callback for when we're finished logging in
  if (callback) {
    this._loginCompleteCallbacks.push(callback);
  }

  // begin logging in if we're not already doing so
  if (!this._loggingIn) {
    this._loggingIn = true;
    this._beginLogin(); //aka reconnect

    setInterval(() => {
      if (this.openedSocket == false) {
        debug('Reconnecting...');
        this._beginLogin();
      }
    }, this.timeInterval);
  }
};

AISyncApi.prototype._loginComplete = function (err) {
  return new Promise((resolve, reject) => {
    const url = this.baseURL + '/phone';
    this.connection = new WebSocket(url);

    this.connection.onopen = () => {
      this.openedSocket = true;

      setTimeout(() => {
        this.WSsend(
          {
            request: 'login',
            data: {
              token: this.token,
            },
          },
          // eslint-disable-next-line no-unused-vars
          (data) => {
            this._loggedIn = true;
            this._loginCompleteCallbacks.forEach((callback) => {
              callback(err);
            });
            this._loginCompleteCallbacks = [];
          }
        );
      }, 500);

      resolve(this.openedSocket);
    };

    this.connection.onmessage = (e) => {
      if (e !== undefined) {
        const data = JSON.parse(e.data);
        debug(data);
        // console.log(data.id);
        if (this.responders[data.id] !== undefined) {
          this.responders[data.id](data);
          delete this.responders[data.id];
        } else {
          if (data.event == 'device_change') {
            this.eventEmitter.emit('device_change', data);
          } else {
            debug('Unknown event type:');
            debug(data);
          }
        }
      }
    };

    this.connection.onclose = (err) => {
      this.openedSocket = false;
      debug('WEBSOCKET_CLOSE: connection closed %o', err);

      reject(err);
    };

    this.connection.onerror = (err) => {
      this.openedSocket = false;
      debug('WEBSOCKET_ERROR: Error', new Error(err.message));

      reject(err);
    };
  });
};

AISyncApi.prototype.WSsend = function (json, callbackMethod) {
  const msgID = this.messageID++;
  json.id = msgID;
  this.responders[msgID] = callbackMethod;
  this.connection.send(JSON.stringify(json));
};

AISyncApi.prototype.wslog = function (data) {
  debug(data);
};

AISyncApi.prototype._beginLogin = function () {
  const url = this.baseURL + '/session';

  request.post(
    url,
    {
      json: {
        email: this.email,
        password: this.password,
      },
    },
    async (err, response, body) => {
      if (response.statusCode === 200) {
        this.token = body.token;

        try {
          await this._loginComplete(); //aka connect
        } catch (err) {
          debug('WEBSOCKET_RECONNECT: Error', new Error(err.message));
        }
      } else {
        debug('Got an error');
        debug(body);
      }
    }
  );
};

AISyncApi.prototype.getDevices = function (callback) {
  if (!this._loggedIn) {
    this.login((err) => {
      if (err) {
        return callback(null, err);
      }

      this.getDevices(callback);
    });
    return;
  }

  this.WSsend(
    {
      request: 'lst_device',
    },
    (data) => {
      callback(data);
    }
  );
};

AISyncApi.prototype.deviceStatus = function (device, callback) {
  if (!this._loggedIn) {
    this.login((err) => {
      if (err) {
        return callback(null, err);
      }

      this.deviceStatus(callback);
    });
    return;
  }

  this.WSsend(
    {
      request: 'get',
      device: device,
      data: null,
    },
    (data) => {
      callback(data);
    }
  );
};

AISyncApi.prototype.fanOnOff = function (device, value, callback) {
  this.WSsend(
    {
      device: device,
      request: 'set',
      data: { H00: value },
    },
    // eslint-disable-next-line no-unused-vars
    (data) => {
      callback(null);
    }
  );
};

AISyncApi.prototype.fanSpeed = function (device, value, callback) {
  this.WSsend(
    {
      device: device,
      request: 'set',
      data: { H02: value },
    },
    // eslint-disable-next-line no-unused-vars
    (data) => {
      callback(null);
    }
  );
};

AISyncApi.prototype.lightOnOff = function (device, value, callback) {
  this.WSsend(
    {
      device: device,
      request: 'set',
      data: { H0B: value },
    },
    // eslint-disable-next-line no-unused-vars
    (data) => {
      callback(null);
    }
  );
};
