'use strict'
/* global Mousetrap */

let Shortkeys = {}
Shortkeys.keys = []

/**
 * Helper function for fetching the full key shortcut config given a keyboard combo.
 *
 * @param keyCombo
 */
Shortkeys.fetchConfig = (keyCombo) => {
  let returnKey = false
  if (Shortkeys.keys.length > 0) {
    Shortkeys.keys.forEach((key) => {
      if (key.key === keyCombo) {
        returnKey = key
      }
    })
  }
  return returnKey
}

/**
 * Create an object that allows storage to be safely used by prefixing all keys with a certain text.
 *
 * @param keyPrefix
 */
Shortkeys.createStorageManager = (keyPrefix) => {
  let convertKeys = (key) => {
    if (typeof key === 'string') {
      if (key === '') {
        return key
      } else {
        return keyPrefix + key
      }
    } else if (Array.isArray(key)) {
      return key.map(k => k !== '' && typeof key === 'string' ? keyPrefix + k : k)
    } else if (key) {
      let newKey = {}
      for (let property of Object.keys(key)) {
        newKey[keyPrefix + property] = key[property]
      }
      return newKey
    } else {
      return key
    }
  }
  let convertResult = (items) => {
    let filteredItems = {}
    for (let property of Object.keys(items)) {
      if (property.indexOf(keyPrefix) === 0 && property.length > keyPrefix.length) {
        let newProperty = property.substring(property.indexOf(keyPrefix) + 1)
        filteredItems[newProperty] = items[property]
      }
    }
    return filteredItems
  }

  let eventListeners = []
  let isEventRegistered = false
  let eventCallback = function (changes, areaName) {
    if (eventListeners.length === 0) {
      chrome.storage.onChanged.removeListener(eventCallback)
      isEventRegistered = false
    } else {
      let filtered = convertResult(changes)
      if (Object.keys(filtered).length > 0) {
        for (let listener of eventListeners) {
          try {
            listener(filtered, areaName)
          } catch (error) { }
        }
      }
    }
  }
  let startListening = function () {
    if (!isEventRegistered) {
      chrome.storage.onChanged.addListener(eventCallback)
      isEventRegistered = true
    }
  }
  let stopListening = function () {
    if (isEventRegistered) {
      chrome.storage.onChanged.removeListener(eventCallback)
      isEventRegistered = false
    }
  }
  let onChangeEvent = {
    addListener (callback) {
      if (onChangeEvent.hasListener(callback)) {
        return
      }
      if (typeof callback !== 'function') {
        throw new Error('Event callback must be a function')
      }
      try {
        startListening()
        eventListeners.push(callback)
      } catch (error) {
        if (eventListeners.length === 0) {
          stopListening()
        }
        throw error
      }
    },
    removeListener (listener) {
      if (!onChangeEvent.hasListener(listener)) {
        return
      }
      try {
        eventListeners = eventListeners.filter(l => listener !== l)
      } finally {
        if (eventListeners.length === 0) {
          stopListening()
        }
      }
    },
    hasListener (listener) {
      return eventListeners.indexOf(listener) >= 0
    }
  }

  let createStorageAreaManger = function (storage) {
    let obj = {
      async get (keys) {
        return new Promise(function (resolve, reject) {
          try {
            storage.get(convertKeys(keys), function (items) {
              try {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError)
                  return
                }

                if (!keys) {
                  // Got all values
                  resolve(convertResult(items))
                } else {
                  resolve(items)
                }
              } catch (error) {
                reject(error)
              }
            })
          } catch (error) {
            reject(error)
          }
        })
      },
      async getBytesInUse (keys) {
        return new Promise(async function (resolve, reject) {
          try {
            if (!keys) {
              // Get total storage
              let items = await obj.get(keys)
              keys = []
              for (let property of Object.keys(items)) {
                keys.push(keyPrefix + property)
              }
            }

            storage.getBytesInUse(convertKeys(keys), function (bytesInUse) {
              try {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError)
                  return
                }
                resolve(bytesInUse)
              } catch (error) {
                reject(error)
              }
            })
          } catch (error) {
            reject(error)
          }
        })
      },
      async set (items) {
        return new Promise(async function (resolve, reject) {
          try {
            storage.set(convertKeys(items), function () {
              try {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError)
                  return
                }
                resolve()
              } catch (error) {
                reject(error)
              }
            })
          } catch (error) {
            reject(error)
          }
        })
      },
      async remove (keys) {
        return new Promise(function (resolve, reject) {
          try {
            storage.remove(convertKeys(keys), function () {
              try {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError)
                  return
                }
                resolve()
              } catch (error) {
                reject(error)
              }
            })
          } catch (error) {
            reject(error)
          }
        })
      },
      async clear () {
        await obj.remove(await obj.get(null))
      }
    }
    // Return a copy of the object:
    return Object.assign({}, obj)
  }

  let local = createStorageAreaManger(chrome.storage.local)
  let sync = createStorageAreaManger(chrome.storage.sync)

  let manager = {
    keyPrefix: keyPrefix,
    get onChanged () {
      // Return a copy of the object:
      return Object.assign({}, onChangeEvent)
    },
    get local () {
      // Return a copy of the object:
      return Object.assign({}, local)
    },
    get sync () {
      // Return a copy of the object:
      return Object.assign({}, sync)
    }
  }

  // Return a copy of the object:
  return Object.assign({}, manager)
}

/**
 * Executes a function in the background script or gets/sets a property in the background script.
 *
 * @param propertyName
 * @param args
 * @param supportFunctionArgs
 * @param propertyAccess
 * @returns {Promise}
 */
Shortkeys.backgroundOperation = async (propertyName, args, supportFunctionArgs, propertyAccess = false) => {
  if (!Array.isArray(args)) {
    args = []
  } else if (propertyAccess && args.length > 1) {
    args.length = 1
  }

  // Handle args that are functions
  let functionArgs = []
  let functions = []
  if (supportFunctionArgs) {
    for (let i = 0; i < args.length; i++) {
      if (typeof args[i] === 'function') {
        functionArgs.push(i)
        functions.push(args[i])
        args[i] = null
      }
    }
  }

  return new Promise((resolve, reject) => {
    try {
      // Send op info to background script:
      chrome.runtime.sendMessage({
        action: 'backgroundoperation',
        property: propertyName,
        operation: (propertyAccess ? 'propertyAccess' : 'functionCall'),
        args: args,
        functionArgs: functionArgs
      }, function (response) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError)
          return
        }
        if (functionArgs.length === 0) {
          // Response is return value. Resolve promise with value:
          try {
            if (response.error) {
              reject(response.error)
            } else {
              resolve(response.result)
            }
          } catch (err) {
            reject(err)
          }
        } else if (response.calledArg && response.args) {
          // Response was to an arg that is a function. Call it:
          let index = functionArgs.indexOf(response.calledArg)
          if (index >= 0) {
            functions[index].apply(null, response.args)
          }
        }
      })
      if (functionArgs.length > 0) {
        // The response of this op is reserved for an arg that is a function
        resolve(undefined)
      }
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Get an object that contains objects that emulates the background scripts extension objects.
 *
 * @param supportFunctionArgs
 * @returns {Promise}
 */
Shortkeys.getBackgroundExtensionObject = async (supportFunctionArgs) => {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ action: 'getExtensionProperties' }, function (response) {
        try {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError)
            return
          }
          let properties = response.extensionObjects
          let emulateProperties = (properties, rootPath = '') => {
            let obj = {}
            for (let property of properties) {
              let value
              let path = (rootPath !== '' ? rootPath + '.' : '') + property.name
              if (property.type === 'object') {
                value = emulateProperties(property.properties, path)
              } else if (property.type === 'function') {
                value = function () {
                  return Shortkeys.backgroundOperation(path, Array.from(arguments), supportFunctionArgs)
                }
              }
              if (value) {
                obj[property.name] = value
              } else {
                Object.defineProperty(obj, property.name, {
                  get: function () {
                    return Shortkeys.backgroundOperation(path, [], supportFunctionArgs, true)
                  }
                })
              }
            }
            return obj
          }
          resolve(emulateProperties(properties))
        } catch (error) {
          reject(error)
        }
      })
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Log a value in the console via the background script.
 *
 * @param value
 */
Shortkeys.log = async (value) => {
  chrome.runtime.sendMessage({
    action: 'log',
    value: value
  })
}

/**
 * Execute some code as a content script
 *
 * @param code
 * @param isAsync
 * @param hideExtensionVars
 * @param allowFunctionArgs
 */
Shortkeys.contentScript = async (code, isAsync = true, hideExtensionVars = false, allowFunctionArgs = true) => {
  if (isAsync) {
    // Make script code async and allow await:
    code = 'async function a() {\n' + code + '\n}\nreturn a()'
  }
  if (hideExtensionVars) {
    // Hide extension objects from user's content scripts
    // Can be circumvented by the use of "new Function(code)"
    code = 'var chrome = undefined\n' + 'var browser = undefined\n' + code
  }

  // Create script first run variables:
  try {
    if (!window.scriptStorage) {
      // Create global. Accessable to all iFrames in the tab.
      window.scriptStorage = {}
    }
  } catch (error) { }
  try {
    if (!Shortkeys.scriptStorageManager) {
      Shortkeys.scriptStorageManager = Shortkeys.createStorageManager('script_')
    }
  } catch (err) {}

  try {
    // eslint-disable-next-line no-new-func
    let script = new Function('call', 'executeInBackground', 'get', 'set', 'log', 'inject', 'storage', 'data', code)
    await script(
      function (functionName) {
        let args = Array.from(arguments)
        if (args.length > 0) {
          args.splice(0, 1)
        }
        return Shortkeys.backgroundOperation(functionName, args, allowFunctionArgs)
      },
      async function (func, args) {
        func = func.toString()
        let properties = await Shortkeys.getBackgroundExtensionObject(allowFunctionArgs)

        let variableDeclarations = ''
        let containerExtensionVariableName = 'extensionVariables'
        for (let property of Object.keys(properties)) {
          variableDeclarations += `var ${property} = ${containerExtensionVariableName}.${property}\n`
        }

        // eslint-disable-next-line no-new-func
        let funcContainer = new Function('func', 'args', containerExtensionVariableName, 'log', variableDeclarations + 'return eval(func).apply(null, args)')
        return funcContainer(func, args || [], properties, Shortkeys.log)
      },
      function (propertyName) {
        return Shortkeys.backgroundOperation(propertyName, [], allowFunctionArgs, true)
      },
      function (propertyName, value) {
        return Shortkeys.backgroundOperation(propertyName, [value], allowFunctionArgs, true)
      },
      Shortkeys.log,
      Shortkeys.injectScript,
      Object.assign({}, Shortkeys.scriptStorageManager),
      window.scriptStorage
    )
  } catch (error) {
    let logMessage = 'Shortkeys user script - Uncaught error:\n' + error
    console.log(logMessage)
    Shortkeys.log(logMessage)
  }
}

/**
 * It's a little hacky, but we have to insert JS this way rather than using executeScript() from the background JS,
 * because this way we have access to the libraries that exist on the page on any given site, such as jQuery.
 *
 * @param code
 */
Shortkeys.injectScript = (code) => {
  let script = document.createElement('script')
  script.textContent = code
  document.body.appendChild(script)
  document.body.removeChild(script)
}

/**
 * Given a key shortcut config item, carry out the action configured for it.
 * This is what happens when the user triggers the shortcut.
 *
 * @param keySetting
 */
Shortkeys.doAction = (keySetting) => {
  let action = keySetting.action
  let message = {}
  for (let attribute in keySetting) {
    message[attribute] = keySetting[attribute]
  }

  if (action === 'javascript') {
    if (keySetting.isContentScript) {
      Shortkeys.contentScript(keySetting.code)
    } else {
      Shortkeys.injectScript(keySetting.code)
    }
    return
  } else if (action === 'trigger') {
    Mousetrap.trigger(keySetting.trigger)
  }

  if (action === 'buttonnexttab') {
    if (keySetting.button) {
      document.querySelector(keySetting.button).click()
    }
    message.action = 'nexttab'
  }

  chrome.runtime.sendMessage(message)
}

/**
 * Given a key shortcut config item, ask if the current site is allowed, and if so,
 * activate the shortcut.
 *
 * @param keySetting
 */
Shortkeys.activateKey = (keySetting) => {
  let action = function () {
    Shortkeys.doAction(keySetting)
    return false
  }
  Mousetrap.bind(keySetting.key.toLowerCase(), action)
}

/**
 * Overrides the default stopCallback from Mousetrap so that we can customize
 * a few things, such as not using the "whitelist inputs with the mousetrap class"
 * functionality and wire up the "activate in form inputs" checkbox.
 *
 * @param e
 * @param element
 * @param combo
 */
Mousetrap.prototype.stopCallback = function (e, element, combo) {
  let keySetting = Shortkeys.fetchConfig(combo)

  if (element.classList.contains('mousetrap')) {
    // We're not using the 'mousetrap' class functionality, which allows
    // you to whitelist elements, so if we come across elements with that class
    // then we can assume that they are provided by the site itself, not by
    // us, so we don't activate Shortkeys in that case, to prevent conflicts.
    // This fixes the chat box in Twitch.tv for example.
    return true
  } else if (!keySetting.activeInInputs) {
    // If the user has not checked "Also allow in form inputs" for this shortcut,
    // then we cut out of the user is in a form input.
    return element.tagName === 'INPUT' ||
      element.tagName === 'SELECT' ||
      element.tagName === 'TEXTAREA' ||
      element.isContentEditable
  } else {
    // The user HAS checked "Also allow in form inputs" for this shortcut so we
    // have no reason to stop it from triggering.
    return false
  }
}

/**
 * Fetches the Shortkeys configuration object and wires up each configured shortcut.
 */
chrome.runtime.sendMessage({action: 'getKeys', url: document.URL}, function (response) {
  if (response) {
    Shortkeys.keys = response
    if (Shortkeys.keys.length > 0) {
      Shortkeys.keys.forEach((key) => {
        Shortkeys.activateKey(key)
      })
    }
  }
})
