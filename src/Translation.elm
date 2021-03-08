module Translation exposing (..)


type Translation
    = A_Title
    | A_Exception String


t : Translation -> String
t a =
    case a of
        A_Title ->
            "Finance v Tabulce"

        A_Exception b ->
            "Application is broken, here are some technical details:\n" ++ b
