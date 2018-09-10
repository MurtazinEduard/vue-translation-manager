#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const glob = require('glob')
const chalk = require('chalk')
const replaceAll = require('replace-string')
const inquirer = require('inquirer')
const Manager = require('./')

var manager = null

require('yargs') // eslint-disable-line
  .command('translate', 'Translate vue files in path', (yargs) => {
    yargs
      .option('askKey', {
        describe: 'Possibility to edit the auto-generated key'
      })
  }, (argv) => {
    manager = setUpManager(argv)
    launchInteractiveTranslationPrompt(argv.askKey)
  })
  .command('clean', 'Remove unused translations from translations resource', (yargs) => {
  }, async (argv) => {
    manager = setUpManager(argv)
    var unusedTranslations = await manager.getUnusedTranslations()
    console.log('❗️ The following translations are not used anywhere:')
    unusedTranslations.map((translation) => {
      console.log(chalk.bold('> ') + chalk.gray(translation))
    })

    var prompt = inquirer.createPromptModule()
    prompt([{
      type: 'list',
      name: 'mode',
      message: 'What do you want to do with them?',
      choices: [
        { name: 'Delete', value: 'delete' },
        { name: 'Ask for each', value: 'ask' },
        { name: 'Nothing', value: 'nothing' }
      ]
    }]).then(async (choice) => {
      if (choice.mode === 'nothing') process.exit(0)

      if (choice.mode === 'delete') {
        await manager.deleteTranslations(unusedTranslations)
        console.log('🎉 Deleted all unused translations')

        process.exit(0)
      }
    })
  })
  .command('add [key]', 'Add a new translation to the resource file(s)', (yargs) => {
    yargs
      .positional('key', {
        describe: 'Key for the new translation'
      })
  }, (argv) => {
    manager = setUpManager(argv)

    var questions = []
    var prompt = inquirer.createPromptModule()
    manager.getLanguages().map((lang) => {
      questions.push({
        type: 'input',
        message: `[${lang}] Translation for "${argv.key}"`,
        name: lang
      })
    })

    prompt(questions).then((answers) => {
      manager.addTranslatedString(argv.key, answers)
      console.log(chalk.green('Added translated string 👍🏻'))
    })
  })
  .command('edit [key]', 'Edit an existing translation', (yargs) => {
    yargs
      .positional('key', {
        describe: 'Key of the translation to edit'
      })
  }, async (argv) => {
    manager = setUpManager(argv)

    let translations = await manager.getTranslationsForKey(argv.key)

    var questions = []
    var prompt = inquirer.createPromptModule()
    manager.getLanguages().map((lang) => {
      questions.push({
        type: 'input',
        message: `[${lang}] Translation for "${argv.key}"`,
        name: lang,
        default: translations[lang] || ''
      })
    })

    prompt(questions).then((answers) => {
      manager.addTranslatedString(argv.key, answers)
      console.log(chalk.green('Successfully edited translations ✌🏻'))
    })
  })
  .command('delete [key]', 'Delete an existing translation', (yargs) => {
    yargs
      .positional('key', {
        describe: 'Key of the translation to delete'
      })
  }, async (argv) => {
    manager = setUpManager(argv)

    await manager.deleteTranslations(argv.key)
    console.log(chalk.green('Successfully deleted translation 💥'))
  })
  .argv

function launchInteractiveTranslationPrompt (askKey) {
  var globPattern = `${manager.getSrcPath()}/**/*.vue`
  var files = glob.sync(globPattern, null)
  var untranslatedComponents = files.filter((file) => containsUntranslatedStrings(file)).map((file) => path.relative(__dirname, file))
  if (!untranslatedComponents.length) {
    console.log(chalk.green('All components translated'))
    process.exit(0)
  }

  var prompt = inquirer.createPromptModule()
  prompt([{
    type: 'list',
    name: 'file',
    message: 'Choose the next file to translate',
    choices: untranslatedComponents
  }]).then(async (answers) => {
    var filePath = answers.file
    var strings = manager.getStringsForComponent(filePath)

    var questions = []
    var replacements = []

    for (var i = 0; i < strings.length; i++) {
      let str = strings[i]
      var key = await manager.getSuggestedKey(filePath, str.string)

      replacements.push({
        key: key,
        where: str.where,
        indexInFile: str.indexInFile,
        stringLength: str.stringLength
      })

      if (askKey) {
        questions.push({
          type: 'input',
          message: `Key for "${str.string}"`,
          name: `${replaceAll(key, '.', '/')}.key`,
          default: key
        })
      }
      manager.getLanguages().map((lang) => {
        questions.push({
          type: 'input',
          message: `[${lang}] Translation for "${str.string}"`,
          name: `${replaceAll(key, '.', '/')}.${lang}`,
          default: str.string
        })
      })
    }

    prompt(questions).then(async (answers) => {
      let keys = Object.keys(answers)
      for (var i = 0; i < keys.length; i++) {
        let key = keys[i]
        var keyInitial = replaceAll(key, '/', '.')
        var newKey = keyInitial
        if (answers[key].key) {
          if (answers[key].key !== keyInitial) {
            newKey = answers[key].key
            if (newKey.indexOf('.') < 0) {
              newKey = keyInitial.substring(0, keyInitial.lastIndexOf('.') + 1) + newKey
            }
            newKey = await manager.getCompatibleKey(newKey)
            replacements.find((replacement) => replacement.key === keyInitial).key = newKey
          }
          delete answers[key].key
        }
        await manager.addTranslatedString(newKey, answers[key])
      }

      manager.replaceStringsInComponent(filePath, replacements)

      prompt([{
        type: 'confirm',
        name: 'continue',
        default: true,
        message: '✨ Translated strings! Do you want to continue?'
      }]).then((answers) => {
        if (!answers.continue) process.exit(0)
        launchInteractiveTranslationPrompt(askKey)
      })
    })
  })
}

function containsUntranslatedStrings (filePath) {
  fs.readFileSync(filePath, { encoding: 'utf8' })
  var results = manager.getStringsForComponent(filePath)
  return (results && results.length > 0)
}

function setUpManager () {
  let config = require(path.join(process.cwd(), '.vue-translation.js'))
  return new Manager(config)
}
