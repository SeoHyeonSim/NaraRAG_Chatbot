import { Bot } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";

const BotAvatar = () => {
    return (
        <Avatar className="h-15 w-15 -z-20 ">
            <AvatarFallback className="h-11 w-11 border-[#94c0f6] border-solid border-[2.5px] bg-white">
                <Bot color="#78b2f8" size={26} />
            </AvatarFallback>
        </Avatar>
    );
};

export default BotAvatar;
