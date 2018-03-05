'use strict'

const path = require('path')
const fs = require('fs-extra')
const Rollbar = require('rollbar')
const Promise = require('bluebird')
const rollbar = module.exports.rollbar = !process.env['ROLLBAR_ACCESS_TOKEN'] ? {
  critical: console.log.bind(console),
  warn: console.log.bind(console),
  info: console.log.bind(console),
  log: console.log.bind(console),
  error: console.error.bind(console),
} : new Rollbar({
  accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
  environment: process.env.NODE_ENV,
  captureUncaught: true,
  captureUnhandledRejections: true
})

const config = require('./config')
const cache = Object.create(null)

const { html, stripIndents } = require('common-tags')

/**
 * @param {string[]} paths
 */
module.exports.localFile = function(...paths) {
  return path.join(__dirname, ...paths)
}

const urlReplace = /(^\w+:|^)\/\//

/**
 * Remove the protocol from url
 *
 * @param {string} url
 */
module.exports.removeProtocol = function(url) {
  return url ? url.replace(urlReplace, '') : ''
}

/**
 * @type {(...paths: string[]) => string}
 */
module.exports.localTemplate = module.exports.localFile.bind(null, '_layouts')
/**
 * @type {(...paths: string[]) => string}
 */
module.exports.localDb = module.exports.localFile.bind(null, '_data')

/**
 * @param {string} path
 */
module.exports.baseUrl = function(path) {
  return `${config.base_url}${path}`
}

const mergeVars = {
  base_url: config.base_url,
  recaptcha_key: config.Recaptcha_Key
}

/**
 * @param {string} str
 * @param {{[index: string]: string}} vars
 */
module.exports.replaceVars = function(str, vars) {
  const merged = Object.assign({}, mergeVars, vars)
  const keys = Object.keys(merged)

  return stripIndents(html`${keys.reduce((out, key) => {
    return out.split(`{{ ${key} }}`).join(`${merged[key]}`)
  }, str)}`)
}

/**
 * @param {string} name
 * @param {{[index: string]: string}} [vars]
 */
module.exports.template = async function template(name, vars = {}) {
  if (name in cache) {
    return Promise.resolve(
      module.exports.replaceVars(cache[name], vars)
    )
  }

  try {
    const result = await fs.readFile(module.exports.localTemplate(`${name}.html`))

    return module.exports.replaceVars(cache[name] = result.toString(), vars)
  } catch (err) {
    rollbar.error(err)

    throw err
  }
}

/**
 * @param {string} template
 * @param {{[index: string]: string}} vars
 * @returns {Promise<string>}
 */
module.exports.layout = async function layout(template, vars) {
  return module.exports.template('default', Object.assign({
    content: await module.exports.template(template, vars)
  }, vars, {
    'page.title': `${vars['page.title'] ? vars['page.title'] + ' | ' : ''}Nano Currency (XRB) Scam Database`
  }))
}
