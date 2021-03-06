const Promise = require('bluebird');
const log = require('electron-log');

const {ipcMain} = require('electron');


/**
 * Map of request origin to Promise.
 * @type {Object<string, !Promise<!Electron.Certificate>>}
 */
const promises = {};


/**
 * Get a client certificate for the provided URL.
 * @param {string} url The URL.
 * @param {!Array<!Certificate>} list Available user certificates.
 * @param {function(Certificate)} callback The callback to call on certificate selection.
 * @param {WebContents} webContents The WebContents instance requesting a certificate.
 */
const getClientCertificate = (url, list, callback, webContents) => {
  getUserCertForUrl(url, list, webContents).then((cert) => {
    callback(cert);
  }, (err) => {
    // This intentionally doesn't call the callback, because Electron will remember the decision. If the app was
    // refreshed, we want Electron to try selecting a cert again when the app loads.
    const reason = err && err.message || 'Unspecified reason.';
    log.error(`Client certificate selection failed: ${reason}`);
  });
};


/**
 * Get the user certificate to use for the provided URL.
 * @param {string} url The URL.
 * @param {!Array<!Certificate>} list Available user certificates.
 * @param {WebContents} webContents The WebContents instance requesting a certificate.
 * @return {!Promise<!Electron.Certificate>} A promise that resolves to the selected certificate.
 */
const getUserCertForUrl = (url, list, webContents) => {
  if (!url) {
    return Promise.reject(new Error('URL for certificate request was empty.'));
  }

  if (!promises[url]) {
    promises[url] = new Promise((resolve, reject) => {
      const callback = (event, eventUrl, cert) => {
        if (eventUrl === url) {
          ipcMain.removeListener('client-certificate-selected', callback);

          // An explicit undefined value means the user did not make a choice (ie, page reload), null means the user
          // cancelled the request and a cert should not be used.
          if (cert === undefined) {
            delete promises[url];
            reject(new Error('Certificate could not be selected by the user.'));
          } else {
            resolve(cert);
          }
        }
      };

      ipcMain.on('client-certificate-selected', callback);
      webContents.send('select-client-certificate', url, list);
    });

    // If the promise is rejected due to page unload, remove the promise so the new session will try again.
    promises[url].then(undefined, (err) => {
      if (err && err.message === 'unload') {
        delete promises[url];
      }
    });
  }

  return promises[url];
};


module.exports = {getClientCertificate};
