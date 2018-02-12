#!/usr/bin/env node

'use strict'

const dns = require('dns')
const url = require('url')
const yaml = require('js-yaml')
const fs = require('fs')
const request = require("request")
const helpers = require('./helpers')

let scams = yaml.safeLoad(fs.readFileSync('_data/scams.yaml').toString())
let scams_checked = 0
let requests_pending = 0
let new_cache = {
  'scams': [],
  'legiturls': [],
  'blacklist': [],
  'addresses': {},
  'ips': {},
  'whitelist': [],
  'updated': (new Date()).getTime()
};

if (!fs.existsSync('_cache')) {
  fs.mkdirSync('_cache')
}

yaml.safeLoad(fs.readFileSync(helpers.localDb('legit_urls.yaml')).toString()).sort(function (a, b) {
  return a.name - b.name;
}).forEach(function (legit_url) {
  new_cache.legiturls.push(legit_url)
  new_cache.whitelist.push(url.parse(legit_url.url).hostname.replace("www.", ""))
  new_cache.whitelist.push('www.' + url.parse(legit_url.url).hostname.replace("www.", ""))
})

setInterval(function () {
  helpers.rollbar.info(scams_checked + '/' + scams.length + ' (' + requests_pending + ' requests pending)');
}, 1000)

scams.forEach(function (scam, index) {
  if ('url' in scam) {
    if (!scam.url.includes('http://') && !scam.url.includes('https://')) {
      helpers.rollbar.warn('Warning! Entry ' + scam.id + ' has no protocol (http or https) specified. Please update!');
      scam.url = 'http://' + scam.url;
    }

    var scam_details = new_cache.scams[new_cache.scams.push(scam) - 1]
    new_cache.blacklist.push(url.parse(scam.url).hostname.replace("www.", ""))
    new_cache.blacklist.push('www.' + url.parse(scam.url).hostname.replace("www.", ""))

    dns.lookup(url.parse(scam.url).hostname, (err, address, family) => {
      if (!err) {
        scam_details.ip = address;
      }

      dns.resolveNs(url.parse(scam.url).hostname, (err, addresses) => {
        if (!err) {
          scam_details.nameservers = addresses;
        }

        requests_pending++;

        var r = request(scam.url, { timeout: 5 * 60 * 1000 }, function (e, response, body) {
          requests_pending--;

          if (e || !([200, 301, 302].includes(response.statusCode))) {
            scam_details.status = 'Offline';
          } else if (r.uri.href.indexOf('cgi-sys/suspendedpage.cgi') !== -1) {
            scam_details.status = 'Suspended';
          } else {
            if ('subcategory' in scam && scam.subcategory == 'NanoWallet') {
              requests_pending++;
              request('http://' + url.parse(scam.url).hostname.replace("www.", "") + '/pow.wasm', { timeout: 5 * 60 * 1000 }, function (e, response, body) {
                requests_pending--;
                if (!e && response.statusCode == 200) {
                  scam_details.status = 'Active';
                } else {
                  scam_details.status = 'Inactive';
                }
              });
            } else if (body == '') {
              scam_details.status = 'Inactive';
            } else {
              scam_details.status = 'Active';
            }
          }

          if ('ip' in scam_details) {
            if (!(scam_details.ip in new_cache.ips)) {
              new_cache.ips[scam_details.ip] = [];
            }
            new_cache.ips[scam_details.ip] = scam_details;
          }
          if ('addresses' in scam_details) {
            scam_details.addresses.forEach(function (address) {
              if (!(address in new_cache.addresses)) {
                new_cache.addresses[address] = [];
              }
              new_cache.addresses[address] = scam_details;
            });
          }
          scams_checked++;
          if (index == (scams.length - 1)) {
            var done_interval = setInterval(function () {
              if (requests_pending == 0) {
                clearInterval(done_interval);
                Object.keys(new_cache.ips).forEach(function (ip) {
                  new_cache.blacklist.push(ip);
                });
                fs.writeFileSync(helpers.localFile('_cache', 'cache.json'), JSON.stringify(new_cache));
                helpers.rollbar.info("Done");
                process.exit(0);
              }
            }, 500);
          }
        });
      });
    });
  } else {
    helpers.rollbar.critical("Fatal error: Scam without URL found (" + scam.id + ")");
    process.abort();
  }
});