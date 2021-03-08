module Interop.JavaScript exposing (..)

{-| Part of <https://github.com/pravdomil/Elm-FFI>.
-}

import Json.Decode as Decode exposing (Decoder)
import Task exposing (Task)


run : String -> Task Exception Decode.Value
run _ =
    Task.fail (Exception "Compiled file needs to be processed via elm-ffi command.")


decode : Decoder a -> Task Exception Decode.Value -> Task Exception a
decode decoder a =
    a
        |> Task.andThen
            (\v ->
                case v |> Decode.decodeValue decoder of
                    Ok b ->
                        Task.succeed b

                    Err b ->
                        Task.fail (Exception (Decode.errorToString b))
            )



--


type Exception
    = Exception String


exceptionToString : Exception -> String
exceptionToString (Exception a) =
    a
