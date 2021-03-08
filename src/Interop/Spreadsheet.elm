module Interop.Spreadsheet exposing (..)

import Interop.JavaScript as JavaScript exposing (Exception)
import Json.Decode as Decode
import Task exposing (Task)


type Spreadsheet
    = Spreadsheet Decode.Value


toast : String -> String -> Float -> Spreadsheet -> Task Exception ()
toast _ _ _ _ =
    "_v3.toast(_v1, _v0, _v2)"
        |> JavaScript.run
        |> JavaScript.decode (Decode.succeed ())
