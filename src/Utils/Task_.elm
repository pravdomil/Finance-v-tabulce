module Utils.Task_ exposing (..)

import Interop.JavaScript exposing (Exception(..))
import Json.Decode as Decode exposing (Decoder)
import Task exposing (..)


fromMaybe : x -> Maybe a -> Task x a
fromMaybe x a =
    case a of
        Just b ->
            Task.succeed b

        Nothing ->
            Task.fail x


fromResult : Result x a -> Task x a
fromResult a =
    case a of
        Ok b ->
            Task.succeed b

        Err b ->
            Task.fail b



--


andThenDecode : Decoder a -> Task Exception Decode.Value -> Task Exception a
andThenDecode decoder a =
    a
        |> Task.andThen
            (\v ->
                v
                    |> Decode.decodeValue decoder
                    |> Result.mapError (Decode.errorToString >> Exception)
                    |> fromResult
            )


andThenMaybe : (a -> Task x (Maybe b)) -> Task x (Maybe a) -> Task x (Maybe b)
andThenMaybe fn a =
    a
        |> Task.andThen
            (\b ->
                case b of
                    Just c ->
                        fn c

                    Nothing ->
                        Task.succeed Nothing
            )


andThenList : (a -> Task x b) -> Task x (List a) -> Task x (List b)
andThenList fn a =
    a
        |> Task.andThen
            (\v ->
                v
                    |> List.map fn
                    |> Task.sequence
            )



--


apply : Task x a -> Task x (a -> b) -> Task x b
apply task a =
    Task.map2 (\fn v -> fn v) a task
