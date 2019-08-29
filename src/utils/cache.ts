import { Trigger } from "typings";
import * as Discord from "discord.js";

const db = require("./database");
const { Collection } = require("discord.js");

const triggers = new Collection();
const ignores = new Collection();
const waiting = new Collection();

async function setWaiter(channel:string, member:Discord.GuildMember) {
    if (!waiting.has(channel)) {
        waiting.set(channel, []);
    }

    const waiters = waiting.get(channel);

    if (waiters.includes(member)) return {exists: true};

    waiters.push(member);
    return {added: true};
}

async function delWaiter(channel:string, member:Discord.GuildMember) {
    if (!waiting.has(channel)) return { deleted: false };

    const waiters = waiting.get(channel);
    
    if (!waiters.includes(member)) return { deleted: false };

    waiters.splice(waiters.indexOf(member), 1);

    if (!waiters.length) waiting.delete(channel);

    return {deleted: true};
}

async function delWaitersIn(channel: string) {
    if (!waiting.has(channel)) return;

    waiting.delete(channel);
}

async function setTrigger(guild:string, user:string, keyword:string, regex:boolean=false) {
    if (!triggers.has(guild)) {
        triggers.set(guild, new Collection());
    }

    if (!triggers.get(guild).has(keyword)) {
        triggers.get(guild).set(keyword, {
            regex: null,
            word: null,
            op: "00",
            users: [],
            usersR: []
        });
    }

    const trigger = triggers.get(guild).get(keyword);

    if (regex) {
        if (!trigger.usersR.includes(user)) {
            trigger.regex = new RegExp(keyword);
            trigger.op = "1" + trigger.op[1];
            trigger.usersR.push(user);
            await db.setTrigger(guild, user, keyword, regex);
            return { added: true };
        }
    } else {
        if (!trigger.users.includes(user)) {
            trigger.word = createWordRegExp(keyword);
            trigger.op = trigger.op[0] + "1";
            trigger.users.push(user);
            await db.setTrigger(guild, user, keyword, regex);
            return { added: true };
        }
    }
    return { exists: true };
}

async function getTriggers(guild:string, user:string) {
    return await db.getTriggers(guild, user);
}

async function delTrigger(guild:string, user:string, keyword:string, regex:boolean) {
    if (triggers.has(guild)) {
        if (triggers.get(guild).has(keyword)) {
            const trigger = triggers.get(guild).get(keyword);
            if (regex) {
                if (trigger.usersR.includes(user)) {
                    trigger.usersR.splice(trigger.usersR.indexOf(user), 1);
                    await db.delTrigger(guild, user, keyword, regex);
                    if (!trigger.usersR.length) {
                        trigger.op = "0" + trigger.op[1];
                        if (!trigger.users.length) {
                            triggers.get(guild).delete(keyword);
                        }
                    }
                    return { deleted: true };
                }
            } else {
                if (trigger.users.includes(user)) {
                    trigger.users.splice(trigger.users.indexOf(user), 1);
                    if (!trigger.users.length) {
                        trigger.op = trigger.op[0] + "0";
                        if (!trigger.usersR.length) {
                            triggers.get(guild).delete(keyword);
                        }
                    }
                    await db.delTrigger(guild, user, keyword, regex);
                    return { deleted: true };
                }
            }


        }
    }

    return { deleted: false };
}

async function delTriggersOf(guild:string, user:string) {
    db.delTriggersOf(guild, user);
    if (triggers.has(guild)) {
        triggers.get(guild).forEach((trigger:Trigger) => {
            if (trigger.usersR.includes(user)) {
                trigger.usersR.splice(trigger.usersR.indexOf(user), 1);
                if (!trigger.usersR.length) {
                    trigger.op = "0" + trigger.op[1];
                    trigger.regex = null;
                }
            }
            if (trigger.users.includes(user)) {
                trigger.users.splice(trigger.users.indexOf(user), 1);
                if (!trigger.users.length) {
                    trigger.op = trigger.op[0] + "0";
                    trigger.word = null;

                }
            }

            if (!trigger.usersR.length && !trigger.users.length) {
                triggers.get(guild).delete(trigger.keyword);
            }
        });
    }
}

async function setIgnore(guild:string, user:string, ignore:string) {
    if (!ignores.has(guild)) {
        ignores.set(guild, new Collection());
    }

    if (!ignores.get(guild).has(user)) {
        ignores.get(guild).set(user, []);
    }

    if (!ignores.get(guild).get(user).includes(ignore)) {
        ignores.get(guild).get(user).push(ignore);
        await db.setIgnore(guild, user, ignore);
        return { added: true };
    } else {
        return { exists: true };
    }

}

async function getIgnores(guild:string, user:string) {
    return await db.getIgnores(guild, user);
}

async function delIgnore(guild:string, user:string, ignore:string) {
    if (ignores.has(guild) && ignores.get(guild).has(user)) {
        const ignores_user = ignores.get(guild).get(user);
        if (ignores_user.includes(ignore)) {
            ignores_user.splice(ignores_user.indexOf(user), 1);
            await db.delIgnore(guild, user, ignore);
            if (!ignores_user.length) {
                ignores.get(guild).delete(user);
            }
            return { deleted: true };
        }
    }

    return { deleted: false };
}

async function delIgnoresOf(guild:string, user:string) {
    db.delIgnoresOf(guild, user);
    if (ignores.has(guild) && ignores.get(guild).has(user)) {
        ignores.get(guild).delete(user);
    }
}

async function delGuild(guild: string) {
    db.delGuild(guild);
    if (triggers.has(guild)) {
        triggers.delete(guild);
    }
    if (ignores.has(guild)) {
        ignores.delete(guild);
    }
}

async function flush() {
    triggers.sweep(() => true);
}

async function build(guilds:Discord.Collection<string, Discord.Guild>) {
    flush();
    const table = await db.allTriggers();
    for (let i = 0; i < table.length; i++) {
        const row = table[i];
        if (!guilds.has(row.guild)) continue;

        if (!triggers.has(row.guild)) {
            triggers.set(row.guild, new Collection());
        }

        if (!triggers.get(row.guild).has(row.keyword)) {
            triggers.get(row.guild).set(row.keyword, {
                regex: null,
                word: null,
                op: "00",
                users: [],
                usersR: []
            });
        }

        const trigger = triggers.get(row.guild).get(row.keyword);

        if (row.regex) {
            if (!trigger.regex) {
                trigger.regex = new RegExp(row.keyword);
            }
            trigger.op = "1" + trigger.op[1];
            trigger.usersR.push(row.user);
        } else {
            if (!trigger.word) {
                trigger.word = createWordRegExp(row.keyword);
            }
            trigger.op = trigger.op[0] + "1";
            trigger.users.push(row.user);
        }
    }

    const ignores_table = await db.allIgnores();
    for (let i = 0; i < ignores_table.length; i++) {
        const row = ignores_table[i];
        if (!guilds.has(row.guild)) continue;

        if (!ignores.has(row.guild)) {
            ignores.set(row.guild, new Collection());
        }

        if (!ignores.get(row.guild).has(row.user)) {
            ignores.get(row.guild).set(row.user, []);
        }

        ignores.get(row.guild).get(row.user).push(row.ignore);
    }
}

function createWordRegExp(word:string) {
    if (!word) return null;
    let prefix = "";
    let suffix = "";
    if (word[0].match(new RegExp("[0-z]"))) {
        prefix = "\\b";
    }
    if (word[word.length-1].match(new RegExp("[0-z]"))) {
        suffix = "\\b";
    }

    return new RegExp(`${prefix}${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${suffix}`);
}

module.exports = {
    build,
    setTrigger,
    getTriggers,
    delTrigger,
    delTriggersOf,
    triggers,
    setIgnore,
    getIgnores,
    delIgnore,
    delIgnoresOf,
    ignores,
    setWaiter,
    delWaiter,
    delWaitersIn,
    waiting,
    delGuild,
};
