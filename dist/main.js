/**
 * Finance v Tabulce
 * https://github.com/pravdomil/Finance-v-Tabulce
 */

/**
 * Runs when a user opens a spreadsheet, document, presentation, or form that the user has permission to edit.
 * Simple triggers can't do anything that requires authorization.
 * More information: https://developers.google.com/apps-script/guides/triggers#restrictions
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Finance").addItem("Install", "install").addToUi()
}

function install() {
  const a = SpreadsheetApp.getActiveSpreadsheet()

  if (ScriptApp.getUserTriggers(a).length === 0) {
    ScriptApp.newTrigger("openTrigger").forSpreadsheet(a).onOpen().create()
  }

  run({ task: "install" })
}

function openTrigger() {
  run({ task: "open" })
}

function dailyTrigger() {
  run({ task: "daily" })
}

function run(flags) {
  Elm.Main.init({ flags })
}

try {
  const url = "https://raw.githubusercontent.com/pravdomil/finance-v-tabulce/master/dist/elm.js"
  const code = UrlFetchApp.fetch(url).getContentText()
  eval(code)
} catch (e) {
  // throw e
  Logger.log(e)
}
