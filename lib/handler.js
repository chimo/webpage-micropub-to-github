'use strict';

const simpleGit = require('simple-git/promise');
const MicropubFormatter = require('format-microformat');
const fulfills = require('fulfills');

const fs = require('fs');

const removeEmptyValues = function (obj) {
  const result = {};
  Object.keys(obj).forEach(key => {
    if (obj[key]) {
      result[key] = obj[key];
    }
  });
  return result;
};

const matchPropertiesToConditions = function (conditions, properties) {
  let result;

  conditions.some(({ condition, value }) => {
    if (fulfills(properties, condition)) {
      result = value;
      return true;
    }
  });

  return result;
};

module.exports = function (gitTarget, micropubDocument, siteUrl, options) {
  const git = simpleGit(gitTarget.path);

  options = removeEmptyValues(options || {});

  let categoryDeriver;

  if (options.deriveCategory) {
    categoryDeriver = (properties) => matchPropertiesToConditions(options.deriveCategory, properties);
  }

  return Promise.resolve(
    options
  )
    .then(options => {
      ['permalinkStyle', 'filenameStyle', 'mediaFilesStyle'].forEach(key => {
        const value = options[key];

        if (Array.isArray(value)) {
          options[key] = (properties) => {
            return matchPropertiesToConditions(value, properties);
          };
        }
      });

      return options;
    })
    .then(options => new MicropubFormatter({
      relativeTo: siteUrl,
      deriveCategory: categoryDeriver,
      deriveLanguages: options.deriveLanguages,
      permalinkStyle: options.permalinkStyle,
      filenameStyle: options.filenameStyle,
      filesStyle: options.mediaFilesStyle
    }))
    .then(formatter => formatter.formatAll(micropubDocument))
    .then(formatted => {
      let category = formatted.raw.derived.category || 'article';

      if (category === 'social') {
        category = 'social interaction';
      }

      git.pull()
        .then(function () {
          return new Promise(function (resolve, reject) {
            fs.writeFile(
              gitTarget.path + formatted.filename,
              formatted.content,
              function (err) {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              });
          });
        })
        .then(git.add(formatted.filename))
        .then(git.commit('New post')) // TODO: Better commit message
        .then(git.push())
        .catch(function (err) {
          console.log('Something went wrong: ' + err);
        });
    });
};
