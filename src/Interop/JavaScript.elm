module Interop.JavaScript exposing (..)

{-| Part of <https://github.com/pravdomil/Elm-FFI>.
-}

import Json.Decode as Decode
import Task exposing (Task)


run : String -> Task Exception Decode.Value
run _ =
    Task.fail (Exception "Compiled file needs to be processed via elm-ffi command.")



--


type Exception
    = Exception String


exceptionToString : Exception -> String
exceptionToString (Exception a) =
    a
