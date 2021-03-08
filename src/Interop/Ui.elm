module Interop.Ui exposing (..)

import Interop.JavaScript as JavaScript exposing (Exception)
import Json.Decode as Decode
import Task exposing (Task)


type Ui
    = Ui Decode.Value


alert : String -> Ui -> Task Exception ()
alert _ _ =
    "_v1.alert(_v0)"
        |> JavaScript.run
        |> JavaScript.decode (Decode.succeed ())
