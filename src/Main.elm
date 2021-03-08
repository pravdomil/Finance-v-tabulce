module Main exposing (..)

import Interop.JavaScript as JavaScript
import Interop.Spreadsheet as Spreadsheet exposing (Spreadsheet)
import Interop.SpreadsheetApp as SpreadsheetApp
import Json.Decode as Decode
import Task exposing (Task)
import Translation exposing (Translation(..), t)


main : Program Decode.Value () ()
main =
    Platform.worker
        { init = \a -> ( (), mainCmd a )
        , update = \_ () -> ( (), Cmd.none )
        , subscriptions = \_ -> Sub.none
        }



--


type Error
    = Exception JavaScript.Exception


errorToTranslation : Error -> Translation
errorToTranslation a =
    case a of
        Exception b ->
            A_Exception (JavaScript.exceptionToString b)



--


mainCmd : Decode.Value -> Cmd ()
mainCmd a =
    (SpreadsheetApp.active |> toError)
        |> Task.andThen
            (\v ->
                case v of
                    Just b ->
                        mainTask a b

                    Nothing ->
                        Task.succeed ()
            )
        |> Task.attempt (always ())


mainTask : Decode.Value -> Spreadsheet -> Task Error ()
mainTask flags a =
    let
        taskName : Result Decode.Error String
        taskName =
            flags
                |> Decode.decodeValue
                    (Decode.field "task" Decode.string)

        task : Task Error ()
        task =
            case taskName of
                Ok "install" ->
                    install a

                Ok "open" ->
                    open a

                Ok "daily" ->
                    daily a

                _ ->
                    Task.succeed ()
    in
    task
        |> Task.onError
            (\v ->
                a |> toast (t (errorToTranslation v))
            )


install : Spreadsheet -> Task Error ()
install a =
    a |> toast "Install task."


open : Spreadsheet -> Task Error ()
open a =
    a |> toast "Open task."


daily : Spreadsheet -> Task Error ()
daily a =
    a |> toast "Daily task."



--


toast : String -> Spreadsheet -> Task Error ()
toast b a =
    Spreadsheet.toast (t A_Title) b 10 a |> toError


toError : Task JavaScript.Exception a -> Task Error a
toError =
    Task.mapError Exception
