'use strict'

var util = require('util')
var _ = require('lodash')
var excludedMap = {}
var filterFn = function (head) {
  return function (ex) {
    return ex.indexOf(head + '.') === 0
  }
}
var mapFn = function (head) {
  return function (ex) {
    return ex.replace(head + '.', '')
  }
}
var shaveHeads = function (arr, head) {
  return arr.filter(filterFn(head)).map(mapFn(head))
}

module.exports = function (model, privateKeys, protectedKeys) {
  excludedMap[model.modelName] = {
    'private': privateKeys,
    'protected': protectedKeys || []
  }

  var getExcluded = this.getExcluded = function (access, modelName) {
    if (access === 'private') {
      return []
    }

    var entry = excludedMap[modelName] ||
      { 'private': privateKeys, 'protected': protectedKeys || [] }

    return access === 'protected' ?
      entry.private : entry.private.concat(entry.protected)
  }

  function filterItem (item, customExclude) {
    // just deleting the excluded keys from item does
    // not modify the object. therefore we build a copy
    var newExcluded
    var excluded = customExclude

    if (!item) {
      return item
    }

    excluded.forEach(function (key) {
      if (key.indexOf('.') > 0) {
        var head = key.split('.')[0]
        if (!item[head]) {
          return
        }

        newExcluded = shaveHeads(excluded, head)
        item[head] = filterItems(item[head], newExcluded)
      } else {
        delete item[key]
      }
    })

    return item
  }

  function filterItems (items, customExclude) {
    if (items instanceof Array) {
      return items.map(function (item) {
        if (item.toObject) {
          item = item.toObject()
        }

        return filterItem(item, customExclude)
      })
    } else {
      if (items && items.toObject) {
        items = items.toObject()
      }
      return filterItem(items, customExclude)
    }
  }
  
  
  function resolvePath(m, pathArray)
  {
    var cur = m.schema
    for (var i = 0; i < pathArray.length - 1; i++) {
        if (!cur.path(pathArray[i])) break;
        cur = cur.path(pathArray[i]).schema;
    }
    //console.log(pathArray[i],i,i === pathArray.length-1)
    return (i === pathArray.length - 1) ? cur : false;
  }

  function findExcludedFieldsFor (fullField, access) {
    var fieldArray = fullField.split('.')
    var prefix = fieldArray.slice(1).join('.')
    var currSchema = model.schema

    var path = resolvePath(model,fieldArray)
    
    if (!path && model.discriminators) {
      _.each(model.discriminators, function (d) {
        path = resolvePath(d,fieldArray)
        if (path) { return false; }
      })
    }
    
    var modelName = path.caster ?
      path.caster.options.ref : path.options.ref

    if (!excludedMap[modelName]) { return }

    var excluded = prefix === '' ?
      getExcluded(access, modelName) :
      getExcluded(access, modelName).map(function (ex) {
        return util.format('%s.%s', prefix, ex)
      })

    return excluded
  }

  function filterPopulated (resource, opts) {
    if (!opts.populate) { return }
    var popArray = opts.populate.split(',')

    for (var i = 0; i < popArray.length; ++i) {
      var popFields = popArray[i].split('.')
      var excludedKeys = findExcludedFieldsFor(popArray[i], opts.access)
      if (!excludedKeys) { continue }

      resource[popFields[0]] = filterItems(resource[popFields[0]],
        excludedKeys)
    }
  }

  this.filterObject = function (resource, opts) {
    opts = opts || {}
    var excludedKeys = getExcluded(opts.access)
    var filtered = filterItems(resource, excludedKeys)

    if (filtered instanceof Array) {
      filtered.forEach(function (item) {
        filterPopulated(item, opts)
      })
    } else {
      filterPopulated(filtered, opts)
    }

    return filtered
  }
}
