'use strict';

const fs = require('fs-extra')
const express = require('express')
const bodyParser = require('body-parser')
const url = require('url')
const dateFormat = require('dateformat')
const spawn = require('child_process').spawn
const request = require('request')
const app = express()
const config = require('./config')
const helpers = require('./helpers')
const { html, safeHtml, stripIndents } = require('common-tags')
let cache = null
let updating_now = false
var older_cache_time

const cachePath = helpers.localFile('_cache', 'cache.json')
const updatePath = helpers.localFile('update.js')

/* See if there's an up-to-date cache, otherwise run `update.js` to create one. */
const getCache = async function () {
  //helpers.rollbar.info('Starting getCache')

  return new Promise(async (resolve, reject) => {
    const exists = await fs.pathExists(cachePath)

    if (exists) {
      if (!cache) {
        try {
          cache = JSON.parse(await fs.readFile(cachePath, { encoding: 'utf8' }))

          resolve(cache)
        } catch (e) {
          reject(e)
        }
      } else if ((new Date().getTime() - cache.updated) < config.cache_refreshing_interval) {
        resolve(cache)
      } else if ((new Date().getTime() - cache.updated) >= config.cache_refreshing_interval) {
        if (!updating_now) {
          updating_now = true
          older_cache_time = cache.updated

          spawn('node', [updatePath], {
            detached: true
          })

          var checkDone2 = setInterval(function () {
            if (cache.updated != older_cache_time) {
              clearInterval(checkDone2)

              helpers.rollbar.info("Successfully updated cache!")

              updating_now = false
            }
          }, 1000)
        }

        resolve(cache)
      }
    } else {
      helpers.rollbar.info("No cache file found. Creating one...")

      if (!updating_now) {
        updating_now = true

        spawn('node', [updatePath], {
          detached: true
        })
      }

      var checkDone = setInterval(async function () {
        const exists = await fs.pathExists(cachePath)

        if (exists) {
          updating_now = false

          try {
            cache = JSON.parse(await fs.readFile(cachePath, { encoding: 'utf8' }))

            clearInterval(checkDone)

            helpers.rollbar.info("Successfully updated cache!")
            resolve(cache)
          } catch (err) {
            reject(err)
          }
        }
      }, 1000)
    }
  })
}

/* Generate an abuse report for a scam domain */
function generateAbuseReport(scam) {
  let abusereport = stripIndents`I would like to inform you of suspicious activities at the domain ${url.parse(scam.url).hostname}
    ${'ip' in scam ? `located at IP address ${scam['ip']}`: ''}.

    ${'subcategory' in scam && scam.subcategory == "NanoWallet" ?
    `The domain is impersonating NanoWallet.io, a website where people can create
    Nano wallets (a cryptocurrency like Bitcoin).` : ''}

    ${'category' in scam && scam.category == "Fake ICO" ?
    `The domain is impersonating a website where an ICO is being held (initial coin offering, like
    an initial public offering but it's for cryptocurrencies)` : ''}

    ${'category' in scam && scam.category == "Phishing" ?
    `The attackers wish to steal funds by using phishing to get the victim's private keys (passwords to a wallet)
    and using them to send funds to their own wallets.` : ''}

    ${'category' in scam && scam.category == "Fake ICO" ?
    `The attackers wish to steal funds by cloning the real website and changing the XRB address so
      people will send funds to the attackers' address instead of the real address.` : ''}

    Please shut down this domain so further attacks will be prevented.`

  return abusereport
}

/* Start the web server */
function startWebServer() {
  app.use(express.static('_static')); // Serve all static pages first

  app.use('/screenshot', express.static('_cache/screenshots/')); // Serve all screenshots

  app.use(bodyParser.json({ strict: true })) // to support JSON-encoded bodies

  app.get('/(/|index.html)?', async function (_req, res) { // Serve index.html
    res.send(await helpers.layout('index', {}))
  })

  app.get('/search/', async function (_req, res) { // Serve /search/

    const verified = [].concat((await getCache()).verified)

    const sorted = verified.sort(function (a, b) {
      return a.name.localeCompare(b.name)
    })

    const table = sorted.map((url) => {
      if ('featured' in url && url.featured) {
        // TODO: put the verified images here
        /*if (
          await fs.pathExists("_static/img/" + url.name.toLowerCase().replace(' ', '') + ".png") ||
          await fs.pathExists("_static/img/" + url.name.toLowerCase().replace(' ', '') + ".svg")
        ) {
          table += "<tr><td><img class='project icon' src='/img/" + url.name.toLowerCase().replace(' ', '') + ".png'>" + url.name + "</td><td><a target='_blank' href='" + url.url + "'>" + url.url + "</a></td></tr>";
        } else {*/
          //helpers.rollbar.warn(`Warning: No verified icon was found for ${url.name}`);
        return `<tr>
          <td>${url.name}</td>
          <td><a target="_blank" href="${url.url}">${url.url}</a></td>
        </tr>`
        //}
      }

      return null
    }).filter((s) => s).join('')

    res.send(await helpers.layout('search', {
      'trusted.table': table,
      'page.title': 'Search for scam sites, scammers addresses and scam ips'
    }))
  })

  app.get('/faq/', async function (_req, res) { // Serve /faq/
    res.send(await helpers.layout('faq', {
      'page.title': 'FAQ'
    }))
  })

  // Serve /report/, /report/domain/, and /report/address/ or /report/domain/fake-mycrypto.com
  app.get('/report/:type?/:value?', async function (req, res, next) {
    let value = ''

    if (req.params.value) {
      value = safeHtml`${req.params.value}`
    }

    switch (`${req.params.type}`) {
      case 'address':
        res.send(await helpers.layout('reportaddress', { 'page.placeholder': value }))
        break
      case 'domain':
        res.send(await helpers.layout('reportdomain', { 'page.placeholder': value }))
        break
      default:
        if (!req.params.type) {
          res.send(await helpers.layout('report', {}))
        } else {
          return next(new Error(`Request type ${req.params.type}`))
        }
    }
  })

  // Serve /scams/
  app.get('/scams/:page?/:sorting?/:direction?', async function (req, res, next) {
    const MAX_RESULTS_PER_PAGE = 30
    const scams = [].concat((await getCache()).scams)

    const currentDirection = `${req.params.direction}` === 'ascending' ? 'ascending' : 'descending'

    let direction = {
      category: '',
      subcategory: '',
      status: '',
      title: '',
    }

    let sorting = {
      category: '',
      subcategory: '',
      status: '',
      title: ''
    }

    switch (`${req.params.sorting}`) {
      case 'category':
        sorting.category = 'sorted'
        direction.category = currentDirection

        scams.sort(function (a, b) {
          if ('category' in a && 'category' in b && a.category && b.category) {
            return a.category.localeCompare(b.category)
          } else {
            return -1
          }
        })
        break
      case 'subcategory':
        sorting.subcategory = 'sorted'
        direction.subcategory = currentDirection

        scams.sort(function (a, b) {
          if ('subcategory' in a && 'subcategory' in b && a.subcategory && b.subcategory) {
            return a.subcategory.localeCompare(b.subcategory)
          } else {
            return -1
          }
        })
        break
      case 'title':
        sorting.title = 'sorted'
        direction.title = currentDirection

        scams.sort(function (a, b) {
          return a.name.localeCompare(b.name)
        })
        break
      case 'status':
        sorting.status = 'sorted'
        direction.status = currentDirection

        scams.sort(function (a, b) {
          if ('status' in a && 'status' in b) {
            if ((a.status == 'Active' && b.status != 'Active') || (a.status == 'Inactive' && (b.status == 'Suspended' || b.status == 'Offline')) || (a.status == 'Suspended' && b.status == 'Offline')) {
              return -1
            } else if (a.status == b.status) {
              return 0
            } else {
              return 1
            }
          } else {
            return 1
          }
        })
        break
      default:
        if (!req.params.sorting) {
          scams.sort(function (a, b) {
            return b.id - a.id
          })
        } else {
          return next(new Error(`Invalid sorting "${req.params.sorting}"`))
        }
    }

    if (currentDirection === 'descending') {
      scams.reverse()
    }

    let addresses = {}

    var intActiveScams = 0
    var intInactiveScams = 0

    scams.forEach(function (scam) {
      if ('addresses' in scam) {
        scam.addresses.forEach(function (address) {
          addresses[address] = true
        })
      }

      if ('status' in scam) {
        if (scam.status === 'Active') {
          ++intActiveScams
        } else {
          ++intInactiveScams
        }
      }
    })

    let max = MAX_RESULTS_PER_PAGE
    let start = 0
    let pagination = []

    const page = +req.params.page || 1

    if (req.params.page == "all") {
      max = scams.length
    } else if (page) {
      max = ((page - 1) * MAX_RESULTS_PER_PAGE) + MAX_RESULTS_PER_PAGE
      start = (page - 1) * MAX_RESULTS_PER_PAGE
    }

    const paginate = req.params.sorting ? `/${req.params.sorting}/${currentDirection}` : ''

    const table = scams.slice(start, max).map((scam) => {
      let status = '<td>None</td>'
      let category = scam.category || '<i class="remove icon"></i> None'
      let subcategory = scam.subcategory  || '<i class="remove icon"></i> None'

      if ('status' in scam) {
        switch (scam.status) {
          case 'Active':
            status = "<td class='offline'><i class='warning sign icon'></i> Active</td>"
            break
          case 'Inactive':
            status = "<td class='suspended'><i class='remove icon'></i> Inactive</td>"
            break
          case 'Offline':
            status = "<td class='activ'><i class='checkmark icon'></i> Offline</td>"
            break
          case 'Suspended':
            status = "<td class='suspended'><i class='remove icon'></i> Suspended</td>"
            break
        }
      }

      if ('category' in scam) {
        switch (scam.category) {
          case "Phishing":
            category = '<i class="address book icon"></i> Phishing'
            break
          case "Scamming":
            category = '<i class="payment icon"></i> Scamming'
            break
          case "Fake ICO":
            category = '<i class="dollar icon"></i> Fake ICO'
            break
        }
      }

      if ('subcategory' in scam && scam.subcategory) {
        const sub = scam.subcategory.toLowerCase().replace(/\s/g, '')

        if (sub == "wallets") {
          subcategory = `<i class="credit card alternative icon"></i> ${scam.subcategory}`
        }

        // TODO: put icons here
        /*else if (fs.existsSync(`_static/img/${sub}.png`)) {
          subcategory = `<img
            src="/img/${scams[i].subcategory.toLowerCase().replace(/\s/g, '')}.png"
            class="subcategoryicon"> ${scams[i].subcategory}`;
        } else {
          subcategory = scams[i].subcategory
          if (!(icon_warnings.includes(subcategory))) {
            icon_warnings.push(subcategory)
          }
        }*/
      }

      let name = scam.name

      if (name.length > 40) {
        name = name.substring(0, 40) + '...'
      }

      return `<tr>
        <td>${category}</td>
        <td>${subcategory}</td>
        ${status}
        <td>${name}</td>
        <td class="center">
          <a href='/scam/${scam.id}'><i class='search icon'></i></a>
        </td>
        </tr>`
    }).join('')

    if (req.params.page !== "all") {
      let arrLoop = [-2, 3]

      if (page == 0) {
        arrLoop = [1, 6]
      } else if (page == 1) {
        arrLoop = [0, 5]
      } else if (page == 2) {
        arrLoop = [-1, 4]
      }

      for (let i = arrLoop[0]; i < arrLoop[1]; i++) {
        let intPageNumber = (page + Number(i))
        let strItemClass = "item"
        let strHref = `/scams/${intPageNumber}${paginate}`

        if ((intPageNumber > (scams.length) / MAX_RESULTS_PER_PAGE) || (intPageNumber < 1)) {
          strItemClass = "disabled item"
          strHref = "#"
        } else if (page == intPageNumber) {
          strItemClass = "active item"
        }

        pagination.push(`<a
          href="${strHref}"
          class="${strItemClass}">${intPageNumber}</a>`)
      }

      if (page > 3) {
        pagination.unshift(`<a
          class="item"
          href="/scams/1${paginate}">
          <i class="angle double left icon"></i>
          </a>`)
      }

      if (page < Math.ceil(scams.length / MAX_RESULTS_PER_PAGE) - 3) {
        pagination.push(`<a
          class="item"
          href="/scams/${(Math.ceil(scams.length / MAX_RESULTS_PER_PAGE) - 1)}${paginate}">
          <i class='angle double right icon'></i>
          </a>`
        )
      }
    }

    res.send(await helpers.layout('scams', {
      'sorting.category.direction': direction.category,
      'sorting.subcategory.direction': direction.subcategory,
      'sorting.status.direction': direction.status,
      'sorting.title.direction': direction.title,
      'sorting.category': sorting.category,
      'sorting.subcategory': sorting.subcategory,
      'sorting.status': sorting.status,
      'sorting.title': sorting.title,
      'scams.total': scams.length.toLocaleString('en-US'),
      'scams.active': intActiveScams.toLocaleString('en-US'),
      'addresses.total': Object.keys(addresses).length.toLocaleString('en-US'),
      'scams.inactive': intInactiveScams.toLocaleString('en-US'),
      'scams.pagination': `<div class="ui pagination menu">${pagination.join('')}</div>`,
      'scams.table': table,
      'page.title': 'Active Scam List'
    }))
  })

  app.get('/scam/:id/', async function (req, res, next) { // Serve /scam/<id>/
    const startTime = Date.now()

    const cache = await getCache()

    const id = +req.params.id
    const scam = cache.scams.find(function (scam) {
      return scam.id == id
    })

    if (!scam) {
      return next(new Error(`Scam id not found ${id}`))
    }

    const hostname = url.parse(scam.url).hostname

    let actions = []
    let category = ''

    if ('category' in scam) {
      category = `<b>Category</b>: ${scam.category}`

      if ('subcategory' in scam) {
        category += ` - ${scam.subcategory}`
      }

      category += '<br>'
    }

    let status = ''

    if ('status' in scam) {
      status = `<b>Status</b>: <span class="class_${scam.status.toLowerCase()}">${scam.status}</span><br>`
    }

    let description = ''

    if ('description' in scam) {
      description = `<b>Description</b>: ${scam.description}<br>`
    }

    let nameservers =  ''

    if ('nameservers' in scam && scam.nameservers && scam.nameservers.length) {
      nameservers = `<b>Nameservers</b>:
      <div class="ui bulleted list">
        ${scam.nameservers.map(function (nameserver) {
          return `<div class="ui item">${nameserver}</div>`
        }).join('')}
      </div>`
    }

    let addresses = ''

    if ('addresses' in scam && scam.addresses && scam.addresses.length) {
      addresses = `<b>Related addresses</b>: <div class="ui bulleted list">
      ${scam.addresses.map(function (address) {
        return `<div class="ui item"><a href="/address/${address}">${address}</a></div>`
      }).join('')}
      </div>`
    }

    let ip = ''

    if ('ip' in scam) {
      ip = `<b>IP</b>: <a href="/ip/${scam.ip}">${scam.ip}</a><br>`
    }

    let abusereport = ''
    let screenshot = ''
    let scamUrl = ''

    if ('url' in scam) {

      abusereport = generateAbuseReport(scam)

      actions.push(`<button
        id="gen"
        class="ui icon secondary button">
        <i class="setting icon"></i> Abuse Report</button>`,
        `<a target="_blank"
        href="http://web.archive.org/web/*/${hostname}"
        class="ui icon secondary button"><i class="archive icon"></i> Archive</a>`
      )

      scamUrl = `<b>URL</b>: <a id="url" target="_blank" href="/redirect/${encodeURIComponent(scam.url)}">${scam.url}</a><br>`

      // TODO: put back the screenshots
      /*
      if ('status' in scam && scam.status != 'Offline' && fs.existsSync('_cache/screenshots/' + scam.id + '.png')) {
        template = template.replace("{{ scam.screenshot }}", '<h3>Screenshot</h3><img src="/screenshot/' + scam.id + '.png">');
      }*/
    }

    actions.push(`<a
      target="_blank"
      href="https://github.com/${config.repository.author}/${config.repository.name}/blob/${config.repository.branch}/_data/scams.yaml"
      class="ui icon secondary button">
      <i class="write alternate icon"></i> Improve</a>
      <button id="share" class="ui icon secondary button">
      <i class="share alternate icon"></i> Share</button>`)

    let googlethreat = ''

    if ('Google_SafeBrowsing_API_Key' in config && config.Google_SafeBrowsing_API_Key && 'url' in scam) {
      var options = {
        uri: 'https://safebrowsing.googleapis.com/v4/threatMatches:find?key=' + config.Google_SafeBrowsing_API_Key,
        method: 'POST',
        json: {
          client: {
            clientId: "Nano Scam DB",
            clientVersion: "1.0.0"
          },
          threatInfo: {
            threatTypes: ["THREAT_TYPE_UNSPECIFIED", "MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["THREAT_ENTRY_TYPE_UNSPECIFIED", "URL", "EXECUTABLE"],
            threatEntries: [{
              "url": hostname
            }]
          }
        }
      }

      googlethreat = `<b>Google Safe Browsing</b>: ${await new Promise((resolve) => {
        request(options, function (error, response, body) {
          if (!error && response.statusCode == 200) {
            if (body && 'matches' in body && body.matches[0]) {
              resolve(html`<span class='class_offline'>Blocked for ${body.matches[0]['threatType']}</span>`)
            } else {
              resolve(html`<span class='class_active'>Not Blocked</span> <a target='_blank' href='https://safebrowsing.google.com/safebrowsing/report_phish/'><i class='warning sign icon'></i></a>`)
            }
          } else {
            resolve('')
          }
        })
      })}<br>`
    }

    res.send(await helpers.layout('scam', {
      'scam.id': scam.id,
      'scam.name': safeHtml(scam.name),
      'scam.category': category,
      'scam.status': status,
      'scam.description': description,
      'scam.nameservers': nameservers,
      'scam.addresses': addresses,
      'scam.ip': ip,
      'scam.abusereport': abusereport,
      'scam.googlethreat': googlethreat,
      'scam.screenshot': screenshot,
      'scam.url': scamUrl,
      'disqus': await helpers.template('disqus', {
        'disqus.id': `scam-${scam.id}`
      }),
      'page.title': safeHtml`Scam ${scam.name}`,
      'scam.actions': `<div id="actions" class="eight wide column">${actions.join('')}</div>`,
      'page.built': `<p class="built">
        This page was built in <b>${Date.now() - startTime}</b>ms, and
        last updated at <b>${dateFormat(cache.updated, "UTC:mmm dd yyyy, HH:MM")} UTC</b>
      </p>`
    }))
  })

  app.get('/ip/:ip/', async function (req, res) { // Serve /ip/<ip>/
    const ip = safeHtml`${req.params.ip}`

    const related = (await getCache()).scams.filter(function (obj) {
      return obj.ip === ip
    }).map(function (value) {
      return `<div class="item">
        <a href="/scam/${value.id}/">${value.name}</a>
      </div>`
    }).join('')

    res.send(await helpers.layout('ip', {
      'ip.ip': ip,
      'ip.scams': html`<div class="ui bulleted list">${related}</div>`,
      'disqus': await helpers.template('disqus', {
        'disqus.id': `ip-${ip}`
      }),
      'page.title': `Scam report for IP ${ip}`
    }));
  });

  app.get('/address/:address/', async function (req, res) { // Serve /address/<address>/
    const address = safeHtml`${req.params.address}`

    const related = (await getCache()).scams.filter(function (obj) {
      if ('addresses' in obj) {
        return obj.addresses.includes(address)
      } else {
        return false
      }
    }).map(function (value) {
      return `<div class="item">
        <a href="/scam/${value.id}/">${value.name}</a>
      </div>`
    }).join('')

    res.send(await helpers.layout('address', {
      'address.address': address,
      'disqus': await helpers.template('disqus', {
        'disqus.id': `address-${address}`
      }),
      'address.scams': `<div class="ui bulleted list">${related}</div>`,
      'page.title': `Scam report for address ${address}`
    }))
  })

  app.get('/redirect/:url/', async function (req, res) { // Serve /redirect/<url>/
    const url = safeHtml`${req.params.url}`

    res.send(await helpers.layout('redirect', {
      'redirect.domain': url,
      'page.title': 'Redirect warning'
    }))
  })

  app.get('/rss/', async function (_req, res) { // Serve /rss/ (rss feed)
    const cache = await getCache()

    res.send(await helpers.template('rss', {
      'rss.entries': cache.scams.map(function (scam) {
        const url = `${config.base_url}scam/${scam.id}`

        return `<item>
            <guid>${url}</guid>
            <title>${safeHtml`${scam.name}`}</title>
            <link>${url}</link>
            <description>${scam.category}</description>
          </item>`;
      }).join('')
    }))
  })

  app.get('/api/:type?/:domain?/', async function (req, res) { // Serve /api/<type>/
    res.header('Access-Control-Allow-Origin', '*')

    const cache = await getCache()
    const type = safeHtml`${req.params.type}`

    /** @type {any} */
    let json = false

    switch (type) {
      case 'scams':
      case 'addresses':
      case 'ips':
      case 'verified':
      case 'blacklist':
      case 'whitelist':
        json = {
          success: true,
          result: cache[type]
        }
        break
      case 'check':
        {
          const domainOrAddress = safeHtml`${req.params.domain}`
          const hostname = url.parse(domainOrAddress).hostname || ''
          const host = helpers.removeProtocol(domainOrAddress)

          if (domainOrAddress) {
            //They can search for an address or domain.
            if (/^xrb_?[0-9a-z]{60}$/.test(domainOrAddress)) {
              const blocked = Object.keys(cache.addresses).some((address) => (domainOrAddress == address))

              //They searched for an address
              if (blocked) {
                json = {
                  success: true,
                  result: 'blocked',
                  type: 'address',
                  entries: cache.scams.filter(function (scam) {
                    if ('addresses' in scam) {
                      return (scam.addresses.includes(domainOrAddress))
                    } else {
                      return false
                    }
                  })
                }
              } else {
                json = {
                  success: true,
                  result: 'neutral',
                  type: 'address',
                  entries: []
                }
              }
            } else {
              //They searched for a domain or an ip address
              if (cache.whitelist.includes(hostname) ||
                cache.whitelist.includes(domainOrAddress)) {

                json = {
                  success: true,
                  result: 'verified'
                }
              } else if (cache.blacklist.includes(hostname) ||
                cache.blacklist.includes(host)) {

                if (/^(([1-9]?\d|1\d\d|2[0-5][0-5]|2[0-4]\d)\.){3}([1-9]?\d|1\d\d|2[0-5][0-5]|2[0-4]\d)$/.test(host)) {
                  //They searched for an ip address
                  json = {
                    success: true,
                    result: 'blocked',
                    type: 'ip',
                    entries: cache.scams.filter(function (scam) {
                      return (
                        url.parse(scam.url).hostname == hostname ||
                        helpers.removeProtocol(scam.url) == domainOrAddress ||
                        scam.ip == host
                      )
                    })
                  }
                } else {
                  //They searched for a domain
                  json = {
                    success: true,
                    result: 'blocked',
                    type: 'domain',
                    entries: cache.scams.filter(function (scam) {
                      return (
                        url.parse(scam.url).hostname == hostname ||
                        helpers.removeProtocol(scam.url) == domainOrAddress
                      )
                    })
                  }
                }
              } else {
                json = {
                  success: false,
                  result: 'neutral',
                  type: 'unsupported',
                  entries: []
                }
              }
            }
          }
        }
        break
      case 'abusereport':
        {
          const domain = safeHtml`${req.params.domain}`
          const hostname = url.parse(domain).hostname

          const results = cache.scams.filter(function (scam) {
            return (
              url.parse(scam.url).hostname == hostname ||
              helpers.removeProtocol(scam.url) == domain
            )
          }) || []

          if (results.length == 0) {
            json = {
              success: false,
              error: "URL wasn't found"
            }
          } else {
            json = {
              success: true,
              result: generateAbuseReport(results[0])
            }
          }
        }
        break
    }

    if (json) {
      res.json(json)
    } else {
      res.send(await helpers.layout('api', {
        'page.title': 'Use the API'
      }))
    }
  })

  // Serve all other pages as 404
  app.get('*', async function (_req, res) {
    res.status(404).send(await helpers.layout('404', {
      'page.title': 'Not found'
    }))
  })

  if (helpers.rollbar['errorHandler']) {
    app.use(helpers.rollbar['errorHandler']())
  }

  app.use(async (_err, _req, res, _next) => {
    res.status(404).send(await helpers.layout('404', {
      'page.title': 'Error'
    }))
  })

  app.listen(config.port, function () { // Listen on port (defined in config)
    helpers.rollbar.info(`Content served on port ${config.port}`)
  })
}

getCache().then(startWebServer).catch((err) => helpers.rollbar.error(err))