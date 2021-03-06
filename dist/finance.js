function finInit() {
  finMenu()
}

function finDailyTrigger() {
  finRefresh()
}

function finMenu() {
  SpreadsheetApp.getUi()
    .createMenu("Finance")
    .addItem("Aktualizovat", "finRefresh")
    .addItem("Rozčlenit", "finCategorize")
    .addSeparator()
    .addItem("Nastavení", "finConfigShow")
    .addSeparator()
    .addItem("Zanést hotovost", "trackCash")
    .addToUi()
}

function finRefresh() {
  fin.refresh()
  fin.categorize()
}

function finCategorize() {
  fin.categorize()
}

function finConfigShow() {
  finConfig.show()
}

function trackCash() {
  var amount = parseInt(Browser.inputBox("Částka"))
  if (!amount) {
    return
  }

  var date = new Date()
  date = date.getDate() + "." + (date.getMonth() + 1) + "." + date.getFullYear()

  var arr = [
    { Datum: date, Objem: amount, Měna: "CZK", "Typ pohybu": "cash" },
    { Datum: date, Objem: amount * -1, Měna: "CZK", "Typ pohybu": "cash" },
  ]

  fin.insert(arr)
  fin.categorize()
}

/////////////////////////

var fin = new (function () {
  this.config = PropertiesService.getScriptProperties()

  this.emptyDbSheet = function () {
    var template = SpreadsheetApp.openById("1pj6zDR6Bh2Zg5DTMQFfa69yiS4np0WqUceuKsEL7jSA")
    return template.getSheetByName("db").copyTo(this.ss).setName("db").activate()
  }

  this.emptyBalanceSheet = function () {
    var template = SpreadsheetApp.openById("1pj6zDR6Bh2Zg5DTMQFfa69yiS4np0WqUceuKsEL7jSA")
    return template.getSheetByName("přehled").copyTo(this.ss).setName("přehled")
  }

  this.refresh = function () {
    this.insert(fioApi.getLatestTransaction())
    this.insert(airApi.getLatestTransaction())
  }

  this.categorize = function () {
    finCategory.resolve(this.sheet)
  }

  this.insert = function (data) {
    if (!data) {
      return
    }

    for (var i = 0; i < data.length; i++) {
      var row = new Array(fin.columns.length)

      for (var c = 0; c < row.length; c++) {
        var column = fin.columns[c]
        var value = data[i][column]

        row[c] = value ? value : ""
      }

      this.sheet.insertRowsAfter(1, 1)
      this.sheet.getRange("2:2").setValues([row])
    }
  }

  this.columnIndex = function (name) {
    name = String(name).toLowerCase()

    for (var i = 0; i < this.columns.length; i++) {
      if (String(this.columns[i]).toLowerCase() == name) {
        return i + 1
      }
    }

    return null
  }

  this.getIds = function () {
    var uniqueCol = this.columnIndex("ID pohybu")
    var ids = this.sheet.getRange(2, uniqueCol, this.sheet.getMaxRows() - 1, 1).getValues()

    // flatten and convert to string
    for (var i = 0; i < ids.length; i++) {
      ids[i] = ids[i][0] + ""
    }

    return ids
  }

  this.ss = SpreadsheetApp.getActive()
  if (this.ss) {
    this.sheet = this.ss.getSheetByName("db") || this.emptyDbSheet()
    this.balance = this.ss.getSheetByName("přehled") || this.emptyBalanceSheet()
    this.columns = this.sheet.getRange("1:1").getValues()[0]
  }
})()

var finRules = new (function () {
  this.emptyRulesSheet = function () {
    var template = SpreadsheetApp.openById("1pj6zDR6Bh2Zg5DTMQFfa69yiS4np0WqUceuKsEL7jSA")
    return template.getSheetByName("kategorie").copyTo(fin.ss).setName("kategorie")
  }

  this.load = function () {
    if (!fin.ss) {
      return
    }

    this.sheet = fin.ss.getSheetByName("kategorie") || this.emptyRulesSheet()
    this.parse(this.sheet.getRange("A:G").getValues())
  }

  this.parse = function (array) {
    this.rules = []

    for (var i = 1; i < array.length; i++) {
      var group = array[i][0]
      var item = array[i][1]
      var note = array[i][5]

      if (!group) {
        continue
      }

      var cond = []
      while (true) {
        var obj = {
          column: array[i][2],
          mode: array[i][3],
          value: String(array[i][4]),
        }

        if (obj.column) {
          cond.push(obj)
        }

        if (array[i + 1][2] != "+") {
          break
        }

        i += 2
      }

      if (cond.length) {
        this.rules.push({ group: group, item: item, cond: cond, note: note })
      }
    }
  }

  this.get = function (row) {
    for (var i = 0; i < this.rules.length; i++) {
      var rule = this.rules[i]
      var passed = false

      for (var c = 0; c < rule.cond.length; c++) {
        var cond = rule.cond[c]

        switch (cond.mode) {
          case "=":
            passed = row[cond.column] == cond.value
            break

          case "~":
            passed =
              String(row[cond.column]).toLowerCase().indexOf(String(cond.value).toLowerCase()) !==
              -1
            break

          case "<":
            passed = row[cond.column] < cond.value
            break

          case ">":
            passed = row[cond.column] > cond.value
            break
        }

        if (passed) {
          return rule
        }
      }
    }
  }
})()

var finCategory = new (function () {
  this.resolve = function (sheet) {
    var range = sheet.getRange(2, 1, sheet.getMaxRows() - 1, fin.columns.length)
    var data = range.getValues()

    for (var r = 0; r < data.length; r++) {
      var modified = this.categorize(data[r])

      for (var key in modified) {
        var ci = fin.columnIndex(key)
        if (ci) {
          sheet.getRange(2 + r, ci).setValue(modified[key])
        }
      }
    }
  }

  this.categorize = function (rowArr) {
    var row = this.rowToObj(rowArr)
    var obj = {}

    var f = function (arg) {
      var func = arg.replace(/FIN_[A-ž_]+/g, function (match, contents, offset, s) {
        match = match.replace(/FIN_/, "")
        match = match.replace(/_/, " ")

        return 'INDIRECT(ADDRESS(ROW(); MATCH("' + match + '"; $1:$1; 0)))'
      })
      return func
    }

    if (row["Pohyb"] === "") {
      obj["Pohyb"] = row["Objem"] < 0 ? "Výdaj" : "Příjem"
    }

    if (row["Částka"] === "") {
      obj["Částka"] = f("=ABS(FIN_OBJEM)")
    }

    if (row["Předatovat"] === "") {
      obj["Předatovat"] = row["Datum"]
    }

    if (row["Měsíc"] === "") {
      obj["Měsíc"] = f(
        '=IF(FIN_PŘEDATOVAT; DATE(YEAR(FIN_PŘEDATOVAT); MONTH(FIN_PŘEDATOVAT); 1); "")'
      )
    }

    if (row["Rok"] === "") {
      obj["Rok"] = f('=IF(FIN_PŘEDATOVAT; YEAR(FIN_PŘEDATOVAT); "")')
    }

    if (row["Poznámka"] !== undefined && String(row["Poznámka"]).trim() === "") {
      if (row["Zpráva pro příjemce"]) {
        obj["Poznámka"] = row["Zpráva pro příjemce"]
      } else if (row["Účel"]) {
        obj["Poznámka"] = row["Účel"]
      }
    }

    if (String(row["Skupina"]).trim() == "" && row["Věc"] == "") {
      var rule = finRules.get(row)

      if (rule) {
        obj["Skupina"] = rule.group
        obj["Věc"] = rule.item

        if (obj["Poznámka"] === "") {
          obj["Poznámka"] = rule.note
        }
      }
    }

    if (row["Skupina"] == "" && !obj["Skupina"]) {
      obj["Skupina"] = " "
    }

    return obj
  }

  this.rowToObj = function (arr) {
    var obj = {}

    for (var i = 0; i < fin.columns.length; i++) {
      var column = fin.columns[i]
      obj[column] = arr[i]
    }

    return obj
  }
})()

var finTrigger = new (function () {
  try {
    if (fin.config.getProperty("triggerSet")) {
      return
    }
    ScriptApp.newTrigger("dailyTrigger").timeBased().atHour(6).everyDays(1).create()
    fin.config.setProperty("triggerSet", true)
  } catch (e) {}
})()

var finConfig = new (function () {
  this.show = function () {
    var html =
      '\
<style>\
*{padding: 0;margin: 0;border: 0;position: relative;box-sizing: border-box;vertical-align: bottom;color: inherit;font: inherit;text-decoration: inherit;letter-spacing: inherit;word-spacing: inherit;text-transform: inherit;}\
input,button,textarea,select,.button{display: inline-block;padding: 0.5rem;height: 2rem;border: 1px solid;-webkit-border-radius: .25rem;border-radius: .25rem;background-clip: padding-box;background-color: #FFF}input[type="submit"]{cursor: pointer}.button{text-align: center;font-weight:normal;}\
html{ font-family: sans-serif; font-size: 17px; }\
body { font-size: 14px; line-height: 1rem; }\
b, a { font-weight: bold; }\
*:target { display: block !important; }\
#fio, #air, *:target ~ form { display: none; }\
</style>\
<b>Finance v tabulce</b><br><br>\
<form id="fio" onsubmit="google.script.run.finBridge(this);google.script.host.close();">\
  Přihlašte se do internetového bankovnictví a v nastavení najděte sekci API. Vytvořte nový token a zadejte ho níže.<br><br>\
  <input type="password" placeholder="Token" name="fioToken"><br><br>\
  <input type="hidden" name="obj" value="fioApi">\
  <input type="hidden" name="func" value="submit">\
  <input type="submit" value="Nastavit">\
</form>\
<form id="air" onsubmit="google.script.run.finBridge(this);google.script.host.close();">\
  Je potřeba úvest přihlašovací údaje do internetového bankovnictví.<br><br>\
  <input type="text" placeholder="Uživatelské jméno" name="airUser"><br><br>\
  <input type="hidden" name="obj" value="airApi">\
  <input type="hidden" name="func" value="submit">\
  <input type="submit" value="Nastavit"><br><br>\
  Pro diakritiku zvolte kódování UTF8 v bankovnictví, nastavení, aplikace, historie plateb.\
</form>\
<form>\
  Zvolte banku, kterou chcete používat pro tuto tabulku.<br><br>\
  <a href="#fio" class="button">Fio banka</a> <a href="#air" class="button">Air Bank</a><br><br><br>\
  Můžete nastavit obě banky zároveň.<br><br>\
  Pro vypnutí účtu nastavte prázdná pole.<br><br>\
  Po nastavení bude tabulka každé ráno automaticky aktualizována.<br><br>\
  <a href="https://github.com/Pravdomil/finance-v-tabulce" target="_blank">Bližší informace</a>.\
</form>\
'
    var htmlOutput = HtmlService.createHtmlOutput(html)
      .setSandboxMode(HtmlService.SandboxMode.IFRAME)
      .setWidth(250)
      .setHeight(300)

    SpreadsheetApp.getUi().showModalDialog(htmlOutput, " ")
  }
})()

var airApi = new (function () {
  this.config = JSON.parse(fin.config.getProperty("air"))

  this.submit = function (args) {
    this.config = { user: args.airUser }
    fin.config.setProperty("air", JSON.stringify(this.config))
  }

  this.show = function () {
    var html =
      '\
<style>\
*{padding: 0;margin: 0;border: 0;position: relative;box-sizing: border-box;vertical-align: bottom;color: inherit;font: inherit;text-decoration: inherit;letter-spacing: inherit;word-spacing: inherit;text-transform: inherit;}\
input,button,textarea,select,.button{display: inline-block;padding: 0.5rem;height: 2rem;border: 1px solid;-webkit-border-radius: .25rem;border-radius: .25rem;background-clip: padding-box;background-color: #FFF}input[type="submit"]{cursor: pointer}.button{text-align: center;font-weight:normal;}\
html{ font-family: sans-serif; font-size: 17px; }\
body { font-size: 14px; line-height: 1rem; }\
b, a { font-weight: bold; }\
</style>\
<b>Finance v tabulce</b><br><br>\
<b>Aktualizace AirBank</b><br><br>\
Nahrajte export výpisu ůčtu ve formátu CSV.<br><br>\
<input id="file" name="file" type="file"><br><br>\
<input value="Nahrát" type="button" onclick="attachFile();this.disabled=true;">\
\
<script>\
function attachFile() {\
  var reader = new FileReader();\
  var file = document.getElementById("file").files[0];\
  reader.onloadend = function() {\
    document.getElementById("csv").value = reader.result;\
    document.getElementById("form").onsubmit();\
  };\
  reader.readAsText(file);\
}\
</script>\
<form id="form" onsubmit="document.body.innerHTML=\'Nahrávám...\'; google.script.run.withSuccessHandler(google.script.host.close).finBridge(this);">\
  <input type="hidden" name="csv" id="csv">\
  <input type="hidden" name="obj" value="airApi">\
  <input type="hidden" name="func" value="submitCsv">\
</form>\
'

    var htmlOutput = HtmlService.createHtmlOutput(html)
      .setSandboxMode(HtmlService.SandboxMode.IFRAME)
      .setWidth(300)
      .setHeight(300)

    try {
      SpreadsheetApp.getUi().showModalDialog(htmlOutput, " ")
    } catch (e) {}
  }

  this.getLatestTransaction = function () {
    if (!this.config || !this.config.user) {
      return
    }
    this.show()
  }

  this.submitCsv = function (args) {
    var csv = this.replaceCols(args.csv)
    var arr = Papa.parse(csv, { header: true, skipEmptyLines: true }).data
    arr.reverse()
    this.postArr(arr)
  }

  this.postArr = function (arr) {
    if (!arr) {
      return
    }

    var ids = fin.getIds()
    var out = []

    for (var i = 0; i < arr.length; i++) {
      // deduplication
      if (ids.indexOf(arr[i]["ID pohybu"]) !== -1) {
        continue
      }
      out.push(arr[i])
    }

    fin.insert(out)
    fin.categorize()
  }

  this.replaceCols = function (csv) {
    var cols = [
      ["Variabilní symbol", "VS"],
      ["Konstantní symbol", "KS"],
      ["Specifický symbol", "SS"],

      ["Datum provedení", "Datum"],
      ["Číslo účtu protistrany", "Protiúčet"],
      ["Typ platby", "Typ pohybu"],

      ["Částka v měně účtu", "Objem"],
      ["Měna účtu", "Měna"],

      ["Poznámka k platbě", "Účel"],
      ["Poznámka pro mne", "Poznámka"],

      ["Název, adresa a stát protistrany", "Název protiúčtu"],
      ["Název, adresa a stát banky protistrany", "Název banky"],

      ["Zadal", "Provedl"],
      ["Referenční číslo", "ID pohybu"],
    ]

    var rows = csv.split(/\r\n|\r|\n/)

    for (var i = 0; i < cols.length; i++) {
      rows[0] = rows[0].replace('"' + cols[i][0] + '"', '"' + cols[i][1] + '"')
    }

    return rows.join("\n")
  }
})()

var fioApi = new (function () {
  this.token = fin.config.getProperty("fioToken")

  this.columns = {
    column0: "Datum",
    column1: "Objem",
    column14: "Měna",
    column2: "Protiúčet",
    column3: "Kód banky",
    column4: "KS",
    column5: "VS",
    column6: "SS",
    column8: "Typ pohybu",
    column16: "Zpráva pro příjemce",
    column7: "Účel", // Uživatelská identifikace
    column25: "Poznámka", // Komentář
    column10: "Název protiúčtu",
    column12: "Název banky",
    column18: "Upřesnění",
    column9: "Provedl",
    column26: "BIC",
    column17: "ID pokynu",
    column22: "ID pohybu",
  }

  this.submit = function (args) {
    this.token = args.fioToken
    fin.config.setProperty("fioToken", this.token)
  }

  this.api = function (arg) {
    if (!this.token) {
      return
    }

    var url = "https://www.fio.cz/ib_api/rest/last/" + this.token + "/" + arg + ".json"
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true })

    if (response.getResponseCode() != 200) {
      throw "FioApi: Bad token? Or too fast? Got status: " + response.getResponseCode() + "."
    }

    return JSON.parse(response.getContentText()).accountStatement
  }

  this.getLatestTransaction = function () {
    var json = this.api("transactions")

    if (!json || !json.transactionList) {
      return
    }

    var list = json.transactionList.transaction

    var trans = []

    for (var i = 0; i < list.length; i++) {
      var obj = list[i]
      trans[i] = {}

      for (var key in this.columns) {
        var val = obj[key]
        var column = this.columns[key]

        if (!val) {
          val = ""
        } else if (column == "Datum") {
          val = val.value.replace(/\+[0-9]+/, "")
        } else {
          val = val.value
        }

        if (column == "Kód banky" && val) {
          trans[i]["Protiúčet"] = trans[i]["Protiúčet"] + "/" + val
          continue
        }

        trans[i][column] = val
      }
    }

    return trans
  }
})()

finRules.load()

/*!
  Papa Parse
  v4.1.2
  https://github.com/mholt/PapaParse
*/
!(function (e) {
  "use strict"
  function t(t, r) {
    if (((r = r || {}), r.worker && S.WORKERS_SUPPORTED)) {
      var n = f()
      return (
        (n.userStep = r.step),
        (n.userChunk = r.chunk),
        (n.userComplete = r.complete),
        (n.userError = r.error),
        (r.step = m(r.step)),
        (r.chunk = m(r.chunk)),
        (r.complete = m(r.complete)),
        (r.error = m(r.error)),
        delete r.worker,
        void n.postMessage({ input: t, config: r, workerId: n.id })
      )
    }
    var o = null
    return (
      "string" == typeof t
        ? (o = r.download ? new i(r) : new a(r))
        : ((e.File && t instanceof File) || t instanceof Object) && (o = new s(r)),
      o.stream(t)
    )
  }
  function r(e, t) {
    function r() {
      "object" == typeof t &&
        ("string" == typeof t.delimiter &&
          1 == t.delimiter.length &&
          -1 == S.BAD_DELIMITERS.indexOf(t.delimiter) &&
          (u = t.delimiter),
        ("boolean" == typeof t.quotes || t.quotes instanceof Array) && (o = t.quotes),
        "string" == typeof t.newline && (h = t.newline))
    }
    function n(e) {
      if ("object" != typeof e) return []
      var t = []
      for (var r in e) t.push(r)
      return t
    }
    function i(e, t) {
      var r = ""
      "string" == typeof e && (e = JSON.parse(e)), "string" == typeof t && (t = JSON.parse(t))
      var n = e instanceof Array && e.length > 0,
        i = !(t[0] instanceof Array)
      if (n) {
        for (var a = 0; a < e.length; a++) a > 0 && (r += u), (r += s(e[a], a))
        t.length > 0 && (r += h)
      }
      for (var o = 0; o < t.length; o++) {
        for (var f = n ? e.length : t[o].length, c = 0; f > c; c++) {
          c > 0 && (r += u)
          var d = n && i ? e[c] : c
          r += s(t[o][d], c)
        }
        o < t.length - 1 && (r += h)
      }
      return r
    }
    function s(e, t) {
      if ("undefined" == typeof e || null === e) return ""
      e = e.toString().replace(/"/g, '""')
      var r =
        ("boolean" == typeof o && o) ||
        (o instanceof Array && o[t]) ||
        a(e, S.BAD_DELIMITERS) ||
        e.indexOf(u) > -1 ||
        " " == e.charAt(0) ||
        " " == e.charAt(e.length - 1)
      return r ? '"' + e + '"' : e
    }
    function a(e, t) {
      for (var r = 0; r < t.length; r++) if (e.indexOf(t[r]) > -1) return !0
      return !1
    }
    var o = !1,
      u = ",",
      h = "\r\n"
    if ((r(), "string" == typeof e && (e = JSON.parse(e)), e instanceof Array)) {
      if (!e.length || e[0] instanceof Array) return i(null, e)
      if ("object" == typeof e[0]) return i(n(e[0]), e)
    } else if ("object" == typeof e)
      return (
        "string" == typeof e.data && (e.data = JSON.parse(e.data)),
        e.data instanceof Array &&
          (e.fields || (e.fields = e.data[0] instanceof Array ? e.fields : n(e.data[0])),
          e.data[0] instanceof Array || "object" == typeof e.data[0] || (e.data = [e.data])),
        i(e.fields || [], e.data || [])
      )
    throw "exception: Unable to serialize unrecognized input"
  }
  function n(t) {
    function r(e) {
      var t = _(e)
      ;(t.chunkSize = parseInt(t.chunkSize)),
        e.step || e.chunk || (t.chunkSize = null),
        (this._handle = new o(t)),
        (this._handle.streamer = this),
        (this._config = t)
    }
    ;(this._handle = null),
      (this._paused = !1),
      (this._finished = !1),
      (this._input = null),
      (this._baseIndex = 0),
      (this._partialLine = ""),
      (this._rowCount = 0),
      (this._start = 0),
      (this._nextChunk = null),
      (this.isFirstChunk = !0),
      (this._completeResults = { data: [], errors: [], meta: {} }),
      r.call(this, t),
      (this.parseChunk = function (t) {
        if (this.isFirstChunk && m(this._config.beforeFirstChunk)) {
          var r = this._config.beforeFirstChunk(t)
          void 0 !== r && (t = r)
        }
        this.isFirstChunk = !1
        var n = this._partialLine + t
        this._partialLine = ""
        var i = this._handle.parse(n, this._baseIndex, !this._finished)
        if (!this._handle.paused() && !this._handle.aborted()) {
          var s = i.meta.cursor
          this._finished ||
            ((this._partialLine = n.substring(s - this._baseIndex)), (this._baseIndex = s)),
            i && i.data && (this._rowCount += i.data.length)
          var a = this._finished || (this._config.preview && this._rowCount >= this._config.preview)
          if (y) e.postMessage({ results: i, workerId: S.WORKER_ID, finished: a })
          else if (m(this._config.chunk)) {
            if ((this._config.chunk(i, this._handle), this._paused)) return
            ;(i = void 0), (this._completeResults = void 0)
          }
          return (
            this._config.step ||
              this._config.chunk ||
              ((this._completeResults.data = this._completeResults.data.concat(i.data)),
              (this._completeResults.errors = this._completeResults.errors.concat(i.errors)),
              (this._completeResults.meta = i.meta)),
            !a ||
              !m(this._config.complete) ||
              (i && i.meta.aborted) ||
              this._config.complete(this._completeResults),
            a || (i && i.meta.paused) || this._nextChunk(),
            i
          )
        }
      }),
      (this._sendError = function (t) {
        m(this._config.error)
          ? this._config.error(t)
          : y &&
            this._config.error &&
            e.postMessage({ workerId: S.WORKER_ID, error: t, finished: !1 })
      })
  }
  function i(e) {
    function t(e) {
      var t = e.getResponseHeader("Content-Range")
      return parseInt(t.substr(t.lastIndexOf("/") + 1))
    }
    ;(e = e || {}), e.chunkSize || (e.chunkSize = S.RemoteChunkSize), n.call(this, e)
    var r
    ;(this._nextChunk = k
      ? function () {
          this._readChunk(), this._chunkLoaded()
        }
      : function () {
          this._readChunk()
        }),
      (this.stream = function (e) {
        ;(this._input = e), this._nextChunk()
      }),
      (this._readChunk = function () {
        if (this._finished) return void this._chunkLoaded()
        if (
          ((r = new XMLHttpRequest()),
          k || ((r.onload = g(this._chunkLoaded, this)), (r.onerror = g(this._chunkError, this))),
          r.open("GET", this._input, !k),
          this._config.chunkSize)
        ) {
          var e = this._start + this._config.chunkSize - 1
          r.setRequestHeader("Range", "bytes=" + this._start + "-" + e),
            r.setRequestHeader("If-None-Match", "webkit-no-cache")
        }
        try {
          r.send()
        } catch (t) {
          this._chunkError(t.message)
        }
        k && 0 == r.status ? this._chunkError() : (this._start += this._config.chunkSize)
      }),
      (this._chunkLoaded = function () {
        if (4 == r.readyState) {
          if (r.status < 200 || r.status >= 400) return void this._chunkError()
          ;(this._finished = !this._config.chunkSize || this._start > t(r)),
            this.parseChunk(r.responseText)
        }
      }),
      (this._chunkError = function (e) {
        var t = r.statusText || e
        this._sendError(t)
      })
  }
  function s(e) {
    ;(e = e || {}), e.chunkSize || (e.chunkSize = S.LocalChunkSize), n.call(this, e)
    var t,
      r,
      i = "undefined" != typeof FileReader
    ;(this.stream = function (e) {
      ;(this._input = e),
        (r = e.slice || e.webkitSlice || e.mozSlice),
        i
          ? ((t = new FileReader()),
            (t.onload = g(this._chunkLoaded, this)),
            (t.onerror = g(this._chunkError, this)))
          : (t = new FileReaderSync()),
        this._nextChunk()
    }),
      (this._nextChunk = function () {
        this._finished ||
          (this._config.preview && !(this._rowCount < this._config.preview)) ||
          this._readChunk()
      }),
      (this._readChunk = function () {
        var e = this._input
        if (this._config.chunkSize) {
          var n = Math.min(this._start + this._config.chunkSize, this._input.size)
          e = r.call(e, this._start, n)
        }
        var s = t.readAsText(e, this._config.encoding)
        i || this._chunkLoaded({ target: { result: s } })
      }),
      (this._chunkLoaded = function (e) {
        ;(this._start += this._config.chunkSize),
          (this._finished = !this._config.chunkSize || this._start >= this._input.size),
          this.parseChunk(e.target.result)
      }),
      (this._chunkError = function () {
        this._sendError(t.error)
      })
  }
  function a(e) {
    ;(e = e || {}), n.call(this, e)
    var t, r
    ;(this.stream = function (e) {
      return (t = e), (r = e), this._nextChunk()
    }),
      (this._nextChunk = function () {
        if (!this._finished) {
          var e = this._config.chunkSize,
            t = e ? r.substr(0, e) : r
          return (r = e ? r.substr(e) : ""), (this._finished = !r), this.parseChunk(t)
        }
      })
  }
  function o(e) {
    function t() {
      if (
        (b &&
          d &&
          (h(
            "Delimiter",
            "UndetectableDelimiter",
            "Unable to auto-detect delimiting character; defaulted to '" + S.DefaultDelimiter + "'"
          ),
          (d = !1)),
        e.skipEmptyLines)
      )
        for (var t = 0; t < b.data.length; t++)
          1 == b.data[t].length && "" == b.data[t][0] && b.data.splice(t--, 1)
      return r() && n(), i()
    }
    function r() {
      return e.header && 0 == y.length
    }
    function n() {
      if (b) {
        for (var e = 0; r() && e < b.data.length; e++)
          for (var t = 0; t < b.data[e].length; t++) y.push(b.data[e][t])
        b.data.splice(0, 1)
      }
    }
    function i() {
      if (!b || (!e.header && !e.dynamicTyping)) return b
      for (var t = 0; t < b.data.length; t++) {
        for (var r = {}, n = 0; n < b.data[t].length; n++) {
          if (e.dynamicTyping) {
            var i = b.data[t][n]
            b.data[t][n] =
              "true" == i || "TRUE" == i ? !0 : "false" == i || "FALSE" == i ? !1 : o(i)
          }
          e.header &&
            (n >= y.length
              ? (r.__parsed_extra || (r.__parsed_extra = []), r.__parsed_extra.push(b.data[t][n]))
              : (r[y[n]] = b.data[t][n]))
        }
        e.header &&
          ((b.data[t] = r),
          n > y.length
            ? h(
                "FieldMismatch",
                "TooManyFields",
                "Too many fields: expected " + y.length + " fields but parsed " + n,
                t
              )
            : n < y.length &&
              h(
                "FieldMismatch",
                "TooFewFields",
                "Too few fields: expected " + y.length + " fields but parsed " + n,
                t
              ))
      }
      return e.header && b.meta && (b.meta.fields = y), b
    }
    function s(t) {
      for (
        var r, n, i, s = [",", "	", "|", ";", S.RECORD_SEP, S.UNIT_SEP], a = 0;
        a < s.length;
        a++
      ) {
        var o = s[a],
          h = 0,
          f = 0
        i = void 0
        for (var c = new u({ delimiter: o, preview: 10 }).parse(t), d = 0; d < c.data.length; d++) {
          var l = c.data[d].length
          ;(f += l), "undefined" != typeof i ? l > 1 && ((h += Math.abs(l - i)), (i = l)) : (i = l)
        }
        c.data.length > 0 && (f /= c.data.length),
          ("undefined" == typeof n || n > h) && f > 1.99 && ((n = h), (r = o))
      }
      return (e.delimiter = r), { successful: !!r, bestDelimiter: r }
    }
    function a(e) {
      e = e.substr(0, 1048576)
      var t = e.split("\r")
      if (1 == t.length) return "\n"
      for (var r = 0, n = 0; n < t.length; n++) "\n" == t[n][0] && r++
      return r >= t.length / 2 ? "\r\n" : "\r"
    }
    function o(e) {
      var t = l.test(e)
      return t ? parseFloat(e) : e
    }
    function h(e, t, r, n) {
      b.errors.push({ type: e, code: t, message: r, row: n })
    }
    var f,
      c,
      d,
      l = /^\s*-?(\d*\.?\d+|\d+\.?\d*)(e[-+]?\d+)?\s*$/i,
      p = this,
      g = 0,
      v = !1,
      k = !1,
      y = [],
      b = { data: [], errors: [], meta: {} }
    if (m(e.step)) {
      var R = e.step
      e.step = function (n) {
        if (((b = n), r())) t()
        else {
          if ((t(), 0 == b.data.length)) return
          ;(g += n.data.length), e.preview && g > e.preview ? c.abort() : R(b, p)
        }
      }
    }
    ;(this.parse = function (r, n, i) {
      if ((e.newline || (e.newline = a(r)), (d = !1), !e.delimiter)) {
        var o = s(r)
        o.successful
          ? (e.delimiter = o.bestDelimiter)
          : ((d = !0), (e.delimiter = S.DefaultDelimiter)),
          (b.meta.delimiter = e.delimiter)
      }
      var h = _(e)
      return (
        e.preview && e.header && h.preview++,
        (f = r),
        (c = new u(h)),
        (b = c.parse(f, n, i)),
        t(),
        v ? { meta: { paused: !0 } } : b || { meta: { paused: !1 } }
      )
    }),
      (this.paused = function () {
        return v
      }),
      (this.pause = function () {
        ;(v = !0), c.abort(), (f = f.substr(c.getCharIndex()))
      }),
      (this.resume = function () {
        ;(v = !1), p.streamer.parseChunk(f)
      }),
      (this.aborted = function () {
        return k
      }),
      (this.abort = function () {
        ;(k = !0), c.abort(), (b.meta.aborted = !0), m(e.complete) && e.complete(b), (f = "")
      })
  }
  function u(e) {
    e = e || {}
    var t = e.delimiter,
      r = e.newline,
      n = e.comments,
      i = e.step,
      s = e.preview,
      a = e.fastMode
    if ((("string" != typeof t || S.BAD_DELIMITERS.indexOf(t) > -1) && (t = ","), n === t))
      throw "Comment character same as delimiter"
    n === !0 ? (n = "#") : ("string" != typeof n || S.BAD_DELIMITERS.indexOf(n) > -1) && (n = !1),
      "\n" != r && "\r" != r && "\r\n" != r && (r = "\n")
    var o = 0,
      u = !1
    ;(this.parse = function (e, h, f) {
      function c(e) {
        b.push(e), (S = o)
      }
      function d(t) {
        return f
          ? p()
          : ("undefined" == typeof t && (t = e.substr(o)), w.push(t), (o = g), c(w), y && _(), p())
      }
      function l(t) {
        ;(o = t), c(w), (w = []), (O = e.indexOf(r, o))
      }
      function p(e) {
        return {
          data: b,
          errors: R,
          meta: { delimiter: t, linebreak: r, aborted: u, truncated: !!e, cursor: S + (h || 0) },
        }
      }
      function _() {
        i(p()), (b = []), (R = [])
      }
      if ("string" != typeof e) throw "Input must be a string"
      var g = e.length,
        m = t.length,
        v = r.length,
        k = n.length,
        y = "function" == typeof i
      o = 0
      var b = [],
        R = [],
        w = [],
        S = 0
      if (!e) return p()
      if (a || (a !== !1 && -1 === e.indexOf('"'))) {
        for (var C = e.split(r), E = 0; E < C.length; E++) {
          var w = C[E]
          if (((o += w.length), E !== C.length - 1)) o += r.length
          else if (f) return p()
          if (!n || w.substr(0, k) != n) {
            if (y) {
              if (((b = []), c(w.split(t)), _(), u)) return p()
            } else c(w.split(t))
            if (s && E >= s) return (b = b.slice(0, s)), p(!0)
          }
        }
        return p()
      }
      for (var x = e.indexOf(t, o), O = e.indexOf(r, o); ; )
        if ('"' != e[o])
          if (n && 0 === w.length && e.substr(o, k) === n) {
            if (-1 == O) return p()
            ;(o = O + v), (O = e.indexOf(r, o)), (x = e.indexOf(t, o))
          } else if (-1 !== x && (O > x || -1 === O))
            w.push(e.substring(o, x)), (o = x + m), (x = e.indexOf(t, o))
          else {
            if (-1 === O) break
            if ((w.push(e.substring(o, O)), l(O + v), y && (_(), u))) return p()
            if (s && b.length >= s) return p(!0)
          }
        else {
          var I = o
          for (o++; ; ) {
            var I = e.indexOf('"', I + 1)
            if (-1 === I)
              return (
                f ||
                  R.push({
                    type: "Quotes",
                    code: "MissingQuotes",
                    message: "Quoted field unterminated",
                    row: b.length,
                    index: o,
                  }),
                d()
              )
            if (I === g - 1) {
              var D = e.substring(o, I).replace(/""/g, '"')
              return d(D)
            }
            if ('"' != e[I + 1]) {
              if (e[I + 1] == t) {
                w.push(e.substring(o, I).replace(/""/g, '"')),
                  (o = I + 1 + m),
                  (x = e.indexOf(t, o)),
                  (O = e.indexOf(r, o))
                break
              }
              if (e.substr(I + 1, v) === r) {
                if (
                  (w.push(e.substring(o, I).replace(/""/g, '"')),
                  l(I + 1 + v),
                  (x = e.indexOf(t, o)),
                  y && (_(), u))
                )
                  return p()
                if (s && b.length >= s) return p(!0)
                break
              }
            } else I++
          }
        }
      return d()
    }),
      (this.abort = function () {
        u = !0
      }),
      (this.getCharIndex = function () {
        return o
      })
  }
  function h() {
    var e = document.getElementsByTagName("script")
    return e.length ? e[e.length - 1].src : ""
  }
  function f() {
    if (!S.WORKERS_SUPPORTED) return !1
    if (!b && null === S.SCRIPT_PATH)
      throw new Error(
        "Script path cannot be determined automatically when Papa Parse is loaded asynchronously. You need to set Papa.SCRIPT_PATH manually."
      )
    var t = S.SCRIPT_PATH || v
    t += (-1 !== t.indexOf("?") ? "&" : "?") + "papaworker"
    var r = new e.Worker(t)
    return (r.onmessage = c), (r.id = w++), (R[r.id] = r), r
  }
  function c(e) {
    var t = e.data,
      r = R[t.workerId],
      n = !1
    if (t.error) r.userError(t.error, t.file)
    else if (t.results && t.results.data) {
      var i = function () {
          ;(n = !0), d(t.workerId, { data: [], errors: [], meta: { aborted: !0 } })
        },
        s = { abort: i, pause: l, resume: l }
      if (m(r.userStep)) {
        for (
          var a = 0;
          a < t.results.data.length &&
          (r.userStep(
            { data: [t.results.data[a]], errors: t.results.errors, meta: t.results.meta },
            s
          ),
          !n);
          a++
        );
        delete t.results
      } else m(r.userChunk) && (r.userChunk(t.results, s, t.file), delete t.results)
    }
    t.finished && !n && d(t.workerId, t.results)
  }
  function d(e, t) {
    var r = R[e]
    m(r.userComplete) && r.userComplete(t), r.terminate(), delete R[e]
  }
  function l() {
    throw "Not implemented."
  }
  function p(t) {
    var r = t.data
    if (
      ("undefined" == typeof S.WORKER_ID && r && (S.WORKER_ID = r.workerId),
      "string" == typeof r.input)
    )
      e.postMessage({ workerId: S.WORKER_ID, results: S.parse(r.input, r.config), finished: !0 })
    else if ((e.File && r.input instanceof File) || r.input instanceof Object) {
      var n = S.parse(r.input, r.config)
      n && e.postMessage({ workerId: S.WORKER_ID, results: n, finished: !0 })
    }
  }
  function _(e) {
    if ("object" != typeof e) return e
    var t = e instanceof Array ? [] : {}
    for (var r in e) t[r] = _(e[r])
    return t
  }
  function g(e, t) {
    return function () {
      e.apply(t, arguments)
    }
  }
  function m(e) {
    return "function" == typeof e
  }
  var v,
    k = !e.document && !!e.postMessage,
    y = k && /(\?|&)papaworker(=|&|$)/.test(e.location.search),
    b = !1,
    R = {},
    w = 0,
    S = {}
  if (
    ((S.parse = t),
    (S.unparse = r),
    (S.RECORD_SEP = String.fromCharCode(30)),
    (S.UNIT_SEP = String.fromCharCode(31)),
    (S.BYTE_ORDER_MARK = "﻿"),
    (S.BAD_DELIMITERS = ["\r", "\n", '"', S.BYTE_ORDER_MARK]),
    (S.WORKERS_SUPPORTED = !k && !!e.Worker),
    (S.SCRIPT_PATH = null),
    (S.LocalChunkSize = 10485760),
    (S.RemoteChunkSize = 5242880),
    (S.DefaultDelimiter = ","),
    (S.Parser = u),
    (S.ParserHandle = o),
    (S.NetworkStreamer = i),
    (S.FileStreamer = s),
    (S.StringStreamer = a),
    "undefined" != typeof module && module.exports
      ? (module.exports = S)
      : m(e.define) && e.define.amd
      ? define(function () {
          return S
        })
      : (e.Papa = S),
    e.jQuery)
  ) {
    var C = e.jQuery
    C.fn.parse = function (t) {
      function r() {
        if (0 == a.length) return void (m(t.complete) && t.complete())
        var e = a[0]
        if (m(t.before)) {
          var r = t.before(e.file, e.inputElem)
          if ("object" == typeof r) {
            if ("abort" == r.action) return void n("AbortError", e.file, e.inputElem, r.reason)
            if ("skip" == r.action) return void i()
            "object" == typeof r.config && (e.instanceConfig = C.extend(e.instanceConfig, r.config))
          } else if ("skip" == r) return void i()
        }
        var s = e.instanceConfig.complete
        ;(e.instanceConfig.complete = function (t) {
          m(s) && s(t, e.file, e.inputElem), i()
        }),
          S.parse(e.file, e.instanceConfig)
      }
      function n(e, r, n, i) {
        m(t.error) && t.error({ name: e }, r, n, i)
      }
      function i() {
        a.splice(0, 1), r()
      }
      var s = t.config || {},
        a = []
      return (
        this.each(function () {
          var t =
            "INPUT" == C(this).prop("tagName").toUpperCase() &&
            "file" == C(this).attr("type").toLowerCase() &&
            e.FileReader
          if (!t || !this.files || 0 == this.files.length) return !0
          for (var r = 0; r < this.files.length; r++)
            a.push({ file: this.files[r], inputElem: this, instanceConfig: C.extend({}, s) })
        }),
        r(),
        this
      )
    }
  }
  y
    ? (e.onmessage = p)
    : S.WORKERS_SUPPORTED &&
      ((v = h()),
      document.body
        ? document.addEventListener(
            "DOMContentLoaded",
            function () {
              b = !0
            },
            !0
          )
        : (b = !0)),
    (i.prototype = Object.create(n.prototype)),
    (i.prototype.constructor = i),
    (s.prototype = Object.create(n.prototype)),
    (s.prototype.constructor = s),
    (a.prototype = Object.create(a.prototype)),
    (a.prototype.constructor = a)
})("undefined" != typeof window ? window : this)
