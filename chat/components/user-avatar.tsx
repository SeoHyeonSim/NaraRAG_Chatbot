import { User } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";

const UserAvatar = () => {
    return (
        <Avatar className="h-15 w-15 -z-20">
            <AvatarFallback className="h-11 w-11 border-[#94c0f6] border-solid border-[2.5px]">
                <User size={26} />
            </AvatarFallback>
        </Avatar>
    );
};

export default UserAvatar;
