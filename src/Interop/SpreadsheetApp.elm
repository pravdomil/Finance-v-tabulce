module Interop.SpreadsheetApp exposing (..)

import Interop.JavaScript as JavaScript exposing (Exception)
import Interop.Spreadsheet exposing (Spreadsheet(..))
import Json.Decode as Decode
import Task exposing (Task)


active : Task Exception (Maybe Spreadsheet)
active =
    "SpreadsheetApp.getActive()"
        |> JavaScript.run
        |> JavaScript.decode (Decode.nullable (Decode.map Spreadsheet Decode.value))
