'use strict'

const path = require('path')
const fs = require('fs-extra')
const Rollbar = require('rollbar')
const rollbar = module.exports.rollbar = new Rollbar({
  accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
  environment: process.env.NODE_ENV,
  captureUncaught: true,
  captureUnhandledRejections: true
})
const config = require('./config')
let cache = Object.create(null)
const { html, safeHtml } = require('common-tags')

/**
 * @param {string[]} paths
 */
module.exports.localFile = function(...paths) {
  return path.join(__dirname, ...paths)
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

/**
 * @param {string} str
 * @param {{[index: string]: string}} vars
 */
module.exports.replaceVars = function(str, vars) {
  const keys = Object.keys(Object.assign({
    base_url: config.base_url,
    recaptcha_key: config.Recaptcha_Key
  }, vars))

  return html`${keys.reduce((out, key) => {
    return out.split(`{{ ${key} }}`).join(safeHtml`${vars[key]}`)
  }, str)}`
}

/**
 * @param {string} name
 * @param {{[index: string]: string}} [vars]
 */
module.exports.template = async function template(name, vars = {}) {
  if (name in cache) {
    return Promise.resolve(module.exports.replaceVars(cache[name], vars))
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
  }, vars))
}
