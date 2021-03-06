#!/usr/bin/env node

'use strict'

const octokit = require('@octokit/rest')()
require('dotenv-safe').config()
const { getBranchDiff } = require('./branch-diff-ish')

require('colors')
const pass = '\u2713'.green
const fail = '\u2717'.red

octokit.authenticate({
  type: 'basic',
  username: process.env.USERNAME,
  password: process.env.PASSWORD
})

// mapping for branch diff version comparison
const compareVersion = {
  'v10.x': 'v11.x',
  'v11.x': 'master'
}

// get audit data to update the gist
function getNewAuditData (auditBranch, callback) {
  const options = {
    filterRelease: true,
    excludeLabels: [
      'semver-major',
      'semver-minor',
      `dont-land-on-${auditBranch}`,
      `backport-requested-${auditBranch}`,
      `backported-to-${auditBranch}`,
      'baking-for-lts'
    ]
  }

  const branchOne = `${auditBranch}-staging`
  const branchTwo = `upstream/${compareVersion[auditBranch]}`

  return getBranchDiff(branchOne, branchTwo, options, callback)
}

async function gistAuditMaker (auditBranch) {
  const auditFileName = `audit-${auditBranch.split('.')[0]}.md`

  // get the audit log gist to edit
  const auditGist = Object.values((await octokit.gists.list()).data)
    .filter(gist => {
      const files = Object.keys(gist.files)
      return files.some(file => file === auditFileName)
    })[0]

  // get updated audit log data
  getNewAuditData(auditBranch, async auditData => {
    if (auditGist) {
      const options = {
        gist_id: auditGist.id,
        files: {}
      }
      options.files[auditFileName] = { content: auditData }

      // update gist with new data
      octokit.gists.update(options)
        .then(gist => {
          console.log(`${pass} See updated gist at: ${gist.data.html_url}`)
        }).catch(err => {
          console.log(`${fail} Failed to update gist: `, err)
          return 1
        })
    } else {
      const options = { files: {} }
      options.files[auditFileName] = { content: auditData }

      // create a new gist
      octokit.gists.create(options)
        .then(gist => {
          console.log(`${pass} Created new gist at: ${gist.data.html_url}`)
        }).catch(err => {
          console.log(`${fail} Failed to create new gist: `, err)
          return 1
        })
    }
  })
}

// initialize from command line
if (require.main === module) {
  let argv = require('minimist')(process.argv.slice(2))
  const auditBranch = argv._[0]

  gistAuditMaker(auditBranch)
}

module.exports = gistAuditMaker
