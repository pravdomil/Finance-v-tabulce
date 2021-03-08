module Interop.SpreadsheetApp exposing (..)

import Interop.JavaScript as JavaScript exposing (Exception)
import Interop.Spreadsheet exposing (Spreadsheet(..))
import Json.Decode as Decode
import Task exposing (Task)
import Utils.Task_ as Task_


active : Task Exception (Maybe Spreadsheet)
active =
    JavaScript.run "SpreadsheetApp.getActive()"
        |> Task_.andThenDecode (Decode.nullable (Decode.map Spreadsheet Decode.value))
