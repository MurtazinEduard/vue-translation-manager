const path = require('path')
path.sep = ''
const { JSONAdapter } = require('./')

module.exports = {
  srcPath: path.join(__dirname, 'test/'),
  adapter: new JSONAdapter({ path: path.join(__dirname, 'messages.json')}),
  languages: ['en', 'de']
}
