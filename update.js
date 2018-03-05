'use strict'

const dns = require('dns')
const url = require('url')
const yaml = require('js-yaml')
const Promise = require('bluebird')
const fs = require('fs-extra')
const request = require("request")
const helpers = require('./helpers')

const lookupAsync = Promise.promisify(dns.lookup)
const resolveNsAsync = Promise.promisify(dns.resolveNs)

const domainChecker = (url) => {
  return new Promise((resolve, reject) => {
    const r = request(url, { timeout: 5 * 60 * 1000 }, (e, response, body) => {
      if (e) {
        return reject(new Error('Offline'))
      }

      if (body === '' || !([200, 301, 302].includes(response.statusCode))) {
        return reject(new Error('Inactive'))
      }

      if (r.uri.href.indexOf('cgi-sys/suspendedpage.cgi') !== -1) {
        return reject(new Error('Suspended'))
      }

      resolve({ response, body })
    })
  })
}

/**
 * @param {string} scamUrl
 */
const urls = (scamUrl) => {
  return [
    url.parse(scamUrl).hostname.replace("www.", ""),
    `www.${url.parse(scamUrl).hostname.replace("www.", "")}`
  ]
}

const init = (async () => {

  let scams = yaml.safeLoad((await fs.readFile('_data/scams.yaml')).toString())
  let scams_checked = 0
  let requests_pending = 0
  let new_cache = {
    scams: [],
    verified: [],
    blacklist: [],
    addresses: {},
    ips: {},
    whitelist: [],
    updated: (new Date()).getTime()
  }

  if (!(await fs.pathExists('_cache'))) {
    await fs.mkdir('_cache')
  }

  yaml.safeLoad(
    (await fs.readFile(helpers.localDb('legit_urls.yaml'), { encoding: 'utf8' })),
    { strict: true }
  )
  .sort(function (a, b) {
    return a.name - b.name
  })
  .forEach(function (legit_url) {
    new_cache.verified.push(legit_url)
    new_cache.whitelist.push(...urls(legit_url.url))
  })

  setInterval(function () {
    helpers.rollbar.info(`${scams_checked}/${scams.length} (${requests_pending} requests pending)`)
  }, 1000)

  const iterate = async function (scam, index) {
    if ('url' in scam) {
      if (!scam.url.includes('http://') && !scam.url.includes('https://')) {
        helpers.rollbar.warn(`Warning! Entry ${scam.id} has no protocol (http or https) specified. Please update!`)
        scam.url = `http://${scam.url}`
      }

      const scam_details = new_cache.scams[new_cache.scams.push(scam) - 1]
      const hostname = url.parse(scam.url).hostname

      new_cache.blacklist.push(...urls(scam.url))

      try {
        const address = await lookupAsync(hostname)

        scam_details.ip = address
      } catch (e) {
        // Swallow the error is the right thing to do?
      }

      try {
        const nameservers = await resolveNsAsync(hostname)
        scam_details.nameservers = nameservers
      } catch (e) {
        // Swallow the error is the right thing to do?
      }

      requests_pending++

      try {
        await domainChecker(scam.url)

        if ('subcategory' in scam && scam.subcategory == 'NanoWallet') {
          await domainChecker(`http://${hostname}/pow.wasm`)

          scam_details.status = 'Active'
        } else {
          scam_details.status = 'Active'
        }
      } catch (e) {
        scam_details.status = e.message
      } finally {
        requests_pending--
      }

      if ('ip' in scam_details) {
        if (!(scam_details.ip in new_cache.ips)) {
          new_cache.ips[scam_details.ip] = []
        }
        new_cache.ips[scam_details.ip] = scam_details
      }

      if ('addresses' in scam_details) {
        scam_details.addresses.forEach(function (address) {

          if (!(address in new_cache.addresses)) {
            new_cache.addresses[address] = []
          }

          new_cache.addresses[address] = scam_details
        })
      }

      scams_checked++

      if (index == (scams.length - 1)) {
        setTimeout(async function checkInterval() {
          if (requests_pending == 0) {
            Object.keys(new_cache.ips).forEach(function (ip) {
              new_cache.blacklist.push(ip)
            })

            await fs.writeFile(
              helpers.localFile('_cache', 'cache.json'),
              JSON.stringify(new_cache),
              { encoding: 'utf8' }
            )

            helpers.rollbar.info("Done")

            process.exit(0)
          } else {
            setTimeout(checkInterval, 500)
          }
        }, 500)
      }
    } else {
      helpers.rollbar.critical(`Fatal error: Scam without URL found (${scam.id})`)
      process.abort()
    }
  }

  scams.forEach(iterate)
})

init()